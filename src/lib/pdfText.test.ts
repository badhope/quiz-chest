import { describe, expect, it } from 'vitest'
import { parsePdfImport, pdfItemsToLines, type PdfExtraction, type PdfTextItem } from './pdfText'

function item(
  str: string,
  x: number,
  y: number,
  extra: Partial<PdfTextItem> = {},
): PdfTextItem {
  return {
    str,
    transform: [12, 0, 0, 12, x, y],
    width: str.length * 12,
    height: 12,
    hasEOL: false,
    ...extra,
  }
}

describe('pdfItemsToLines', () => {
  it('把同一行的中文碎片拼回一句，并把康熙部首折回汉字', () => {
    const lines = pdfItemsToLines([
      item('光合作', 68, 420, { width: 48.7 }),
      item('⽤', 116.7, 420, { width: 12 }),
      item('的场所是？【填空题】', 128.7, 420, { width: 120, hasEOL: true }),
    ])
    expect(lines).toEqual(['光合作用的场所是？【填空题】'])
  })

  it('按 y 坐标换行，并在英文词之间补空格', () => {
    const lines = pdfItemsToLines([
      item('Which', 68, 700, { width: 28 }),
      item('one', 100, 700, { width: 18 }),
      item('is correct?', 68, 680, { hasEOL: true }),
    ])
    expect(lines).toEqual(['Which one', 'is correct?'])
  })

  it('空片段带 EOL 时不会留下空行', () => {
    const lines = pdfItemsToLines([
      item('1. 题干', 68, 700),
      item('', 68, 700, { hasEOL: true }),
      item('A. 选项', 68, 680, { hasEOL: true }),
    ])
    expect(lines).toEqual(['1. 题干', 'A. 选项'])
  })
})

describe('parsePdfImport', () => {
  const extraction: PdfExtraction = {
    text: `# PDF 自测卷

1. 2 + 2 等于多少？
A. 3
B. 4
C. 5
D. 6
答案：B
解析：2 + 2 = 4，基础加法。`,
    pageCount: 2,
    readPages: 2,
    emptyPages: [2],
    truncatedPages: false,
    truncatedText: false,
    title: '',
  }

  it('复用文本模板解析，并把空页提示放到预览 issues 最前面', () => {
    const parsed = parsePdfImport(extraction, 'PDF 自测卷.pdf')
    expect(parsed.bank?.title).toBe('PDF 自测卷')
    expect(parsed.bank?.subtitle).toBe('PDF 导入')
    expect(parsed.bank?.questions).toHaveLength(1)
    expect(parsed.issues[0]).toMatchObject({ field: 'pdf' })
    expect(parsed.issues[0].message).toContain('第 2 页没有文字层')
  })

  it('页数截断与文字截断分别给出提示', () => {
    const parsed = parsePdfImport(
      { ...extraction, pageCount: 80, readPages: 60, truncatedPages: true, truncatedText: true },
      'PDF 自测卷.pdf',
    )
    expect(parsed.issues.map((issue) => issue.message).join(' ')).toContain('只读取前 60 页')
    expect(parsed.issues.map((issue) => issue.message).join(' ')).toContain('末尾内容已截断')
  })

  it('PDF 元数据标题可以补到题库名里', () => {
    const parsed = parsePdfImport(
      { ...extraction, text: '1. 题干\nA. 甲\nB. 乙\n答案：A\n解析：测试解析。', title: '期末冲刺卷' },
      '扫描文档.pdf',
    )
    expect(parsed.bank?.title).toBe('期末冲刺卷')
  })
})
