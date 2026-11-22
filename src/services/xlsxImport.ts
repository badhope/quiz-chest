import { readSheet, type CellValue } from 'read-excel-file/browser'
import { parseRows, type ParseResult } from '../lib/importer'
import dayjs from '../lib/datetime'

/**
 * Excel 工作簿 → 导入管线。
 *
 * 解析交给 `read-excel-file`（浏览器版，内部处理 sharedStrings、inlineStr、
 * 日期与合并单元格），不再自己拆 zip + 正则 XML。拿到二维表后仍然走
 * `parseRows`，保证 CSV 与 Excel 的校验规则只有一份。
 */
export async function parseWorkbookFile(buffer: ArrayBuffer): Promise<ParseResult> {
  let rows: unknown[][]
  try {
    rows = (await readSheet(buffer)) as CellValue[][]
  } catch (error) {
    return {
      bank: null,
      issues: [
        {
          line: 1,
          field: 'file',
          message: `Excel 解析失败：${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      questionCount: 0,
    }
  }

  const toText = (value: unknown): string => {
    if (value == null) return ''
    if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD')
    return String(value).trim()
  }

  const matrix = rows
    .map((row) => row.map(toText))
    .filter((row) => row.some((cell) => cell !== ''))
  // 去掉表头右侧的空列，避免把「拖过格式的空白列」当成字段。
  const width = matrix.reduce((max, row) => {
    let last = row.length - 1
    while (last >= 0 && row[last] === '') last -= 1
    return Math.max(max, last + 1)
  }, 0)
  if (width === 0) {
    return { bank: null, issues: [{ line: 1, field: 'file', message: 'Excel 文件里没有可读内容' }], questionCount: 0 }
  }
  const normalized = matrix.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''))
  if (normalized.length < 2) {
    return { bank: null, issues: [{ line: 1, field: 'file', message: 'Excel 至少需要表头 + 1 行数据' }], questionCount: 0 }
  }
  return parseRows(normalized[0], normalized.slice(1))
}
