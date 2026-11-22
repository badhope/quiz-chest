import { zipSync, strToU8 } from 'fflate'

/**
 * E2E 里构造真实 xlsx 字节（共享字符串形态）。
 *
 * 不依赖任何 xlsx 库：npm 上的 SheetJS 带未修复的 high 漏洞，而测试需要的
 * 只是「一个结构合法的 xlsx」，用 fflate 现拼三个 XML 就够了。
 */
export function buildXlsx(rows: string[][]): Buffer {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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

  const zipped = zipSync({
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(sharedStrings),
  })
  return Buffer.from(zipped)
}
