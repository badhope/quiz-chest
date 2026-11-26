import type { ImportIssue, ParseResult } from './importer'
import { parseTextImport } from './textImport'

/**
 * PDF 文本导入。
 *
 * 只读 PDF 的文字层，不渲染页面、不做 OCR。扫描件没有文字层，强行「识别」
 * 只会得到空白或乱码；这里明确把它当作不支持的情况，提示用户先用系统 OCR
 * 转成文本，再走粘贴或 TXT 导入。
 *
 * pdfjs-dist 只在用户真的选择 PDF 时动态加载，首屏与普通导入不背这份体积。
 * 字体映射表和标准字体由 `scripts/copy-pdf-assets.mjs` 复制到 public/pdfjs/，
 * 否则 CID 编码的中文 PDF 会连字都取不出来。
 */

const MAX_PDF_PAGES = 60
const MAX_PDF_TEXT_CHARS = 2_000_000

/** pdfjs 的文本项形状；不直接 import 它的内部 type，避免把构建类型带进业务层。 */
export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

export interface PdfExtraction {
  text: string
  /** PDF 真实页数。 */
  pageCount: number
  /** 本次实际读取的页数。 */
  readPages: number
  /** 没有文字层的页码（1 起）。 */
  emptyPages: number[]
  /** 超过页数或字符上限，内容被截断。 */
  truncatedPages: boolean
  truncatedText: boolean
  /** PDF 元数据里的标题，可能为空或不可靠。 */
  title: string
}

export interface PdfExtractOptions {
  onProgress?: (readPages: number, totalPages: number) => void
}

/**
 * PDF.js 抽取某些中文字体时会吐出康熙部首（如 `⽤`、`⼊`）或兼容汉字区码位，
 * 它们看起来像原字，但码位不同，题干会变成另一个字。只对这两段做 NFKC，
 * 不用整串 NFKC：后者会把中文的 `？`、`：` 一并折成半角，题库排版会变得很怪。
 */
export function normalizePdfText(value: string): string {
  return value
    .replace(/[\u2e80-\u2fdf\uf900-\ufaff]/g, (char) => char.normalize('NFKC'))
    .replace(/\u00ad/g, '')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * 把一页的文本项拼回行。
 *
 * PDF 没有「行」这个概念，只有一堆带坐标的文本片段。按 y 坐标换行，
 * 按 x 间距决定是否补空格；同一行的中文字符经常被拆成多个片段，
 * 间距接近 0，不能每个片段都塞空格。
 */
export function pdfItemsToLines(items: PdfTextItem[]): string[] {
  const lines: string[] = []
  let line = ''
  let lastY: number | null = null
  let lastXEnd = 0
  let lastHeight = 0

  const flush = () => {
    const cleaned = line.replace(/[ \t]+/g, ' ').trim()
    if (cleaned) lines.push(cleaned)
    line = ''
    lastY = null
    lastXEnd = 0
    lastHeight = 0
  }

  for (const item of items) {
    const text = normalizePdfText(item.str ?? '')
    if (!text) {
      if (item.hasEOL) flush()
      continue
    }
    const height = Number.isFinite(item.height) && item.height > 0 ? item.height : 10
    const x = Number.isFinite(item.transform?.[4]) ? item.transform[4] : 0
    const y = Number.isFinite(item.transform?.[5]) ? item.transform[5] : 0

    if (lastY !== null) {
      const yGap = Math.abs(y - lastY)
      const lineTolerance = Math.max(2, Math.min(height, lastHeight || height) * 0.35)
      if (yGap > lineTolerance) {
        flush()
      } else if (x < lastXEnd - Math.max(2, height * 0.2)) {
        // 同一行但起点往左跳，通常是分栏或另一段，先断开，避免把两栏粘成一句。
        flush()
      } else {
        const gap = x - lastXEnd
        const wordGap = Math.max(1.5, height * 0.2)
        if (gap > wordGap && !line.endsWith(' ') && !text.startsWith(' ')) line += ' '
      }
    }

    line += text
    lastY = y
    lastXEnd = x + (Number.isFinite(item.width) ? item.width : 0)
    lastHeight = height
    if (item.hasEOL) flush()
  }
  flush()
  return lines
}

function safeTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  const title = normalizePdfText(value)
  if (title.length < 2 || title.length > 80) return ''
  // Chromium 打印、Word 另存等会留下这类占位标题，盖掉正文里的真实题库名。
  if (/^(about:blank|untitled|document|无标题|未命名|新建文档)$/i.test(title)) return ''
  if (/^microsoft (word|powerpoint)/i.test(title)) return ''
  return title
}

export async function extractPdfText(
  data: ArrayBuffer,
  options: PdfExtractOptions = {},
): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const base = import.meta.env.BASE_URL || '/'
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdfjs/pdf.worker.min.js`

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    useWorkerFetch: false,
  })

  let doc: Awaited<typeof loadingTask.promise> | null = null
  try {
    doc = await loadingTask.promise
    const pageCount = doc.numPages
    const readLimit = Math.min(pageCount, MAX_PDF_PAGES)
    const pages: string[] = []
    const emptyPages: number[] = []
    let truncatedText = false
    let metadataTitle = ''

    try {
      const metadata = await doc.getMetadata()
      metadataTitle = safeTitle((metadata.info as { Title?: unknown } | undefined)?.Title)
    } catch {
      // 元数据不是必需，损坏时继续读正文。
    }

    for (let pageNumber = 1; pageNumber <= readLimit; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        const lines = pdfItemsToLines(content.items as PdfTextItem[])
        const pageText = lines.join('\n').trim()
        if (!pageText) {
          emptyPages.push(pageNumber)
        } else {
          pages.push(pageText)
        }
      } finally {
        page.cleanup()
      }
      options.onProgress?.(pageNumber, readLimit)
    }

    let text = pages.join('\n\n')
    if (text.length > MAX_PDF_TEXT_CHARS) {
      text = text.slice(0, MAX_PDF_TEXT_CHARS)
      truncatedText = true
    }

    return {
      text,
      pageCount,
      readPages: readLimit,
      emptyPages,
      truncatedPages: pageCount > readLimit,
      truncatedText,
      title: metadataTitle,
    }
  } finally {
    try {
      await loadingTask.destroy()
    } catch {
      // 已经关闭或 worker 提前退出时，清理失败不影响结果。
    }
  }
}

/**
 * 把 PDF 抽取结果接到现有的题号模板解析器。
 *
 * 这里不另写一套 PDF 题目解析：题号、选项、答案、解析的规则已经在
 * parseTextImport 里，PDF 只是换了一个文字来源。页数/空页等提示挂在
 * 预览页的 issue 列表里，不悄悄丢页。
 */
export function parsePdfImport(extraction: PdfExtraction, fileName: string): ParseResult {
  const parsed = parseTextImport(extraction.text, fileName)
  const warnings: ImportIssue[] = []

  if (extraction.emptyPages.length > 0) {
    warnings.push({
      line: 0,
      field: 'pdf',
      message: `PDF 第 ${extraction.emptyPages.join('、')} 页没有文字层，已跳过。扫描页请先用系统 OCR 转成文本。`,
    })
  }
  if (extraction.truncatedPages) {
    warnings.push({
      line: 0,
      field: 'pdf',
      message: `PDF 共 ${extraction.pageCount} 页，本次只读取前 ${extraction.readPages} 页；请拆分后再导入剩余部分。`,
    })
  }
  if (extraction.truncatedText) {
    warnings.push({
      line: 0,
      field: 'pdf',
      message: 'PDF 文字超过单次导入上限，末尾内容已截断；请拆分后再导入剩余部分。',
    })
  }

  if (parsed.bank && extraction.title) {
    const title = extraction.title
    if (!parsed.bank.title || parsed.bank.title === fileName.replace(/\.[^.]+$/, '')) {
      parsed.bank.title = title
    }
  }
  if (parsed.bank) {
    parsed.bank.subtitle = 'PDF 导入'
    parsed.bank.description = '从 PDF 文字层按题号模板导入的题库。'
  }

  return {
    ...parsed,
    issues: [...warnings, ...parsed.issues],
  }
}
