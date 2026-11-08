import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseRows } from './importer'
import { parseWorkbookFile } from '../services/xlsxImport'
import { readWorkbookMatrix } from '../services/xlsxReader'

const HEADERS = ['title', 'stem', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'explanation', 'type']

/**
 * 手工构造一个真实的 xlsx 字节流。
 *
 * 不调用被测的 reader，也不依赖任何第三方 xlsx 库：这样测试验证的是
 * 「标准 xlsx 结构能否被正确读取」，而不是「库的序列化和反序列化是否自洽」。
 */
function buildXlsx(rows: string[][]): ArrayBuffer {
  const escape = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  // 所有单元格都按共享字符串写入，覆盖最常见的一种 xlsx 形态。
  const strings: string[] = []
  const index = new Map<string, number>()
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          if (value === '') return ''
          if (!index.has(value)) {
            index.set(value, strings.length)
            strings.push(value)
          }
          const ref = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`
          return `<c r="${ref}" t="s"><v>${index.get(value)}</v></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')

  const sharedStrings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((value) => `<si><t>${escape(value)}</t></si>`).join('') +
    `</sst>`

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(sharedStrings),
  }
  const zipped = zipSync(files)
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
}

describe('Excel 行管线（与 CSV 共用 parseRows）', () => {
  it('与 CSV 相同的表头校验：缺列时报错而不是静默', () => {
    const result = parseRows(['stem', 'answer'], [['题干', 'A']])
    expect(result.bank).toBeNull()
    expect(result.issues[0].message).toContain('缺少必需列')
  })

  it('正常行可导入，行号从 2 开始计数', () => {
    const result = parseRows(HEADERS, [
      ['期中卷', '水的沸点', '90', '100', '110', '120', 'B', '标准大气压下为 100 度', 'single'],
    ])
    expect(result.bank?.title).toBe('期中卷')
    expect(result.questionCount).toBe(1)
    expect(result.issues).toHaveLength(0)
  })

  it('坏行逐条报错并定位到行号，好行照常入库', () => {
    const result = parseRows(HEADERS, [
      ['期中卷', '好题', 'A', 'B', '', '', 'A', '因为是对的', 'single'],
      ['期中卷', '缺解析的题', 'A', 'B', '', '', 'A', '', 'single'],
      ['期中卷', '选项不足', 'A', '', '', '', 'A', '解析文字', 'single'],
    ])
    expect(result.questionCount).toBe(1)
    const fields = result.issues.map((issue) => issue.field)
    expect(fields).toContain('explanation')
    expect(fields).toContain('options')
    expect(result.issues.find((issue) => issue.field === 'explanation')?.line).toBe(3)
    expect(result.issues.find((issue) => issue.field === 'options')?.line).toBe(4)
  })
})

describe('xlsx 读取器（真实 zip 结构）', () => {
  it('读出表头与数据行', () => {
    const matrix = readWorkbookMatrix(
      buildXlsx([
        ['stem', 'answer'],
        ['第一题', 'A'],
        ['第二题', 'B'],
      ]),
    )
    expect(matrix.headers).toEqual(['stem', 'answer'])
    expect(matrix.rows).toEqual([
      ['第一题', 'A'],
      ['第二题', 'B'],
    ])
  })

  it('共享字符串里的 XML 实体被正确解码', () => {
    const matrix = readWorkbookMatrix(
      buildXlsx([
        ['stem', 'answer'],
        ['a < b & c > d', 'A'],
      ]),
    )
    expect(matrix.rows[0][0]).toBe('a < b & c > d')
  })

  it('跳过整行空白', () => {
    const matrix = readWorkbookMatrix(
      buildXlsx([
        ['stem', 'answer'],
        ['有内容', 'A'],
        ['', ''],
      ]),
    )
    expect(matrix.rows).toHaveLength(1)
  })

  it('非 zip 字节给出明确错误', () => {
    expect(() => readWorkbookMatrix(new Uint8Array([1, 2, 3, 4]))).toThrow(/不是有效的 xlsx/)
  })

  it('zip 里没有工作表时明确报错', () => {
    const zipped = zipSync({ 'readme.txt': strToU8('nothing here') })
    const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
    expect(() => readWorkbookMatrix(bytes as ArrayBuffer)).toThrow(/没有工作表/)
  })
})

describe('xlsx 文件导入（端到端）', () => {
  it('从真实 xlsx 字节导入题库', async () => {
    const result = await parseWorkbookFile(
      buildXlsx([
        HEADERS,
        ['Excel 卷', '一年有多少个月', '10', '11', '12', '13', 'C', '一年十二个月', 'single'],
        ['Excel 卷', '下列哪些是偶数', '1', '2', '3', '4', 'B;D', '能被 2 整除', 'multiple'],
      ]),
    )
    expect(result.bank?.title).toBe('Excel 卷')
    expect(result.questionCount).toBe(2)
    expect(result.bank?.questions[1].answer).toEqual([1, 3])
  })

  it('解析失败时返回 issue 而不是抛错', async () => {
    const result = await parseWorkbookFile(new Uint8Array([0, 1, 2]).buffer)
    expect(result.bank).toBeNull()
    expect(result.issues[0].message).toContain('不是有效的 xlsx')
  })

  it('只有表头没有数据行时给出明确错误', async () => {
    const result = await parseWorkbookFile(buildXlsx([HEADERS]))
    expect(result.bank).toBeNull()
    expect(result.issues[0].message).toContain('至少需要表头')
  })
})
