import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseTextImport } from './textImport'
import { extractDocxText } from './docxText'

const sample = `# 综合练习

1. 2 + 2 等于多少？
A. 3
B. 4
C. 5
D. 6
答案：B
解析：2 + 2 = 4，基础加法。

2. 下列哪些是偶数？【多选】
A. 2
B. 3
C. 7
D. 8
答案：A、D
解析：2 和 8 能被 2 整除，是偶数。

3. 地球是太阳系行星。 
A. 正确
B. 错误
答案：A
解析：地球是太阳系八大行星之一。

4. 这道题故意没有答案。
A. 对
B. 错
`

describe('parseTextImport', () => {
  it('parses numbered questions, options, answers and explanations', () => {
    const result = parseTextImport(sample, '综合练习.txt')
    expect(result.bank?.title).toBe('综合练习')
    expect(result.questionCount).toBe(3)
    expect(result.bank?.questions[0].answer).toEqual([1])
    expect(result.bank?.questions[1].type).toBe('multiple')
    expect(result.bank?.questions[1].answer).toEqual([0, 3])
    expect(result.bank?.questions[2].type).toBe('judge')
    expect(result.issues.some((issue) => issue.message.includes('缺少答案'))).toBe(true)
  })

  it('accepts a judge question without options when the answer is 对/错', () => {
    const result = parseTextImport(`1. 水在标准大气压下 100℃ 沸腾。\n答案：正确\n解析：标准大气压下水的沸点是 100℃。`)
    expect(result.questionCount).toBe(1)
    expect(result.bank?.questions[0].type).toBe('judge')
    expect(result.bank?.questions[0].options).toEqual(['正确', '错误'])
    expect(result.bank?.questions[0].answer).toEqual([0])
  })

  it('skips duplicate stems and reports them', () => {
    const result = parseTextImport(`1. 同一道题\nA. 甲\nB. 乙\n答案：A\n解析：第一份解析\n\n2. 同一道题\nA. 甲\nB. 乙\n答案：A\n解析：第二份解析`)
    expect(result.questionCount).toBe(1)
    expect(result.issues.some((issue) => issue.message.includes('重复'))).toBe(true)
  })

  it('returns a clear error when nothing matches the template', () => {
    const result = parseTextImport('这是一篇普通文章，没有任何题目。')
    expect(result.bank).toBeNull()
    expect(result.issues[0].message).toContain('没有识别到题目')
  })
})

describe('extractDocxText', () => {
  it('extracts paragraphs and decodes XML entities from document.xml', () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>1. A &amp; B</w:t></w:r></w:p>
<w:p><w:r><w:t>A. 选项</w:t></w:r></w:p>
<w:p><w:r><w:t>B. 选项</w:t></w:r></w:p>
<w:p><w:r><w:t>答案：A</w:t></w:r></w:p>
</w:body>
</w:document>`
    const zip = zipSync({ 'word/document.xml': strToU8(documentXml) })
    const text = extractDocxText(zip.buffer as ArrayBuffer)
    expect(text).toContain('1. A & B')
    expect(text).toContain('A. 选项\nB. 选项')
    expect(parseTextImport(text).questionCount).toBe(1)
  })

  it('rejects a zip without document.xml', () => {
    const zip = zipSync({ 'word/other.xml': strToU8('<x/>') })
    expect(() => extractDocxText(zip.buffer as ArrayBuffer)).toThrow(/document.xml/)
  })
})
