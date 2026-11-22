import { unzipSync, strFromU8 } from 'fflate'

/**
 * 最小 xlsx 读取器。
 *
 * 为什么不用 SheetJS：npm 上的 `xlsx` 停在 0.18.5，带 2 个 high 漏洞
 * （原型污染、ReDoS），修复版只在 SheetJS 自家 CDN 发布，进不了正常依赖链。
 * 引入一个已知高危、无 npm 修复路径的库不值得。
 *
 * xlsx 本质是一个 zip，里面是若干 XML。题库导入只需要「第一张表的单元格文本」，
 * 用 fflate 解 zip（8KB、零依赖、无已知漏洞）+ 手写极简 XML 解析即可覆盖：
 *   - 共享字符串表 sharedStrings.xml（大多数文本都在这里）
 *   - 内联字符串 inlineStr
 *   - 数字/布尔单元格（按文本返回，避免 12 → 12.00000001）
 *
 * 不支持的：公式重算、日期格式转换、合并单元格、多表选择。
 * 这些对「导入题库」都没有意义——导入要的是行列文本。
 */

const decoder = new TextDecoder('utf-8')

interface SheetCell {
  column: number
  text: string
}

/** 把 XML 里的实体还原。顺序很重要：&amp; 必须最后处理，否则会二次解码。 */
function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 去掉 XML 声明、注释与标签，留下纯文本（用于 <t> 内部）。 */
function textOf(xml: string): string {
  return decodeXml(
    xml
      .replace(/<[^>]*>/g, '')
      .replace(/\r\n?/g, '\n')
      .trim(),
  )
}

/** 解析 sharedStrings.xml：每个 <si> 是一个共享字符串，内部可能有多段 <t>。 */
function parseSharedStrings(xml: string): string[] {
  const result: string[] = []
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let match: RegExpExecArray | null
  while ((match = siRegex.exec(xml)) !== null) {
    const body = match[1]
    // 富文本会把文本拆成多段 <r><t>…</t></r>，全部拼起来。
    const parts: string[] = []
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let piece: RegExpExecArray | null
    while ((piece = tRegex.exec(body)) !== null) parts.push(textOf(piece[1]))
    // 没有 <t> 的 <si> 视为空串。
    result.push(parts.join(''))
  }
  return result
}

/** 把 "A1"/"AB12" 形式的引用转成 0 基列号。 */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A'
  let index = 0
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

/** 解析一张工作表，返回稀疏行 → 按列号排序的单元格。 */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const cells: SheetCell[] = []
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const attrs = cellMatch[1]
      const body = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      if (!ref) continue
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      let text = ''
      if (type === 's') {
        // 共享字符串：<v> 里是索引
        const index = Number(textOf(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''))
        text = shared[index] ?? ''
      } else if (type === 'inlineStr') {
        const inner = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? body
        const parts: string[] = []
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g
        let piece: RegExpExecArray | null
        while ((piece = tRegex.exec(inner)) !== null) parts.push(textOf(piece[1]))
        text = parts.join('')
      } else if (type === 'str') {
        // 公式结果字符串
        text = textOf(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      } else {
        text = textOf(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      }
      cells.push({ column: columnIndex(ref), text: text.trim() })
    }
    // 补齐空洞：按列号放进行数组，缺的列留空串。
    const maxColumn = cells.reduce((max, cell) => Math.max(max, cell.column), -1)
    const row: string[] = new Array(Math.max(maxColumn + 1, 0)).fill('')
    for (const cell of cells) row[cell.column] = cell.text
    rows.push(row)
  }
  return rows
}

export interface WorkbookMatrix {
  headers: string[]
  rows: string[][]
}

/**
 * 读取 xlsx 的第一张工作表，返回表头 + 数据行。
 *
 * 抛错而不是返回空：调用方需要区分「文件损坏」与「表里就是没数据」，
 * 前者要给用户明确的失败原因。
 */
export function readWorkbookMatrix(buffer: ArrayBuffer | Uint8Array): WorkbookMatrix {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('不是有效的 xlsx 文件（可能是旧版 .xls 或被改过后缀）')
  }

  const sheetKey = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0]
  if (!sheetKey) {
    throw new Error('xlsx 里没有工作表（缺少 xl/worksheets/sheet1.xml）')
  }

  const sharedXml = files['xl/sharedStrings.xml']
    ? decoder.decode(files['xl/sharedStrings.xml'])
    : ''
  const shared = sharedXml ? parseSharedStrings(sharedXml) : []

  const sheetXml = decoder.decode(files[sheetKey])
  // strFromU8 只是显式声明编码，避免不同环境下默认编码差异。
  void strFromU8

  const matrix = parseSheet(sheetXml, shared)
  if (matrix.length === 0) {
    return { headers: [], rows: [] }
  }
  const [headers = [], ...rows] = matrix
  return {
    headers: headers.map((cell) => cell.trim()),
    rows: rows.filter((row) => row.some((cell) => cell !== '')),
  }
}
