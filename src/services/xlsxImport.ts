import type { ParseResult } from '../lib/importer'
import { parseRows } from '../lib/importer'
import { readWorkbookMatrix } from './xlsxReader'

/**
 * Excel 工作簿 → 导入管线。
 *
 * 解析用自带的 `xlsxReader`（fflate 解 zip + 极简 XML），不走 SheetJS：
 * npm 上的 SheetJS 带未修复的 high 漏洞，见 xlsxReader.ts 的说明。
 * 拿到二维表后走与 CSV 完全相同的 `parseRows`，保证两种格式行为一致。
 */
export async function parseWorkbookFile(buffer: ArrayBuffer): Promise<ParseResult> {
  let matrix
  try {
    matrix = readWorkbookMatrix(buffer)
  } catch (error) {
    return {
      bank: null,
      issues: [
        {
          line: 1,
          field: 'file',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      questionCount: 0,
    }
  }
  if (matrix.headers.length === 0) {
    return {
      bank: null,
      issues: [{ line: 1, field: 'file', message: 'Excel 文件里没有工作表' }],
      questionCount: 0,
    }
  }
  if (matrix.rows.length === 0) {
    return {
      bank: null,
      issues: [{ line: 1, field: 'file', message: 'Excel 至少需要表头 + 1 行数据' }],
      questionCount: 0,
    }
  }
  return parseRows(matrix.headers, matrix.rows)
}
