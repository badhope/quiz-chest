import { describe, expect, it } from 'vitest'
import {
  detectFormat,
  normalizeImageSource,
  detectFormatFromContent,
  normalizeId,
  parseImportCsv,
  parseImportJson,
  parseRows,
} from './importer'

const validBank = {
  title: '前端面试 300 题',
  subtitle: '面试冲刺',
  exam: '前端面试',
  questions: [
    {
      type: 'single',
      stem: 'typeof null 的结果是什么？',
      options: ['"null"', '"object"', '"undefined"', '"boolean"'],
      answer: ['B'],
      explanation: 'typeof null 返回 object，这是 JavaScript 的历史遗留问题。',
      difficulty: 2,
      tags: ['类型'],
    },
    {
      type: 'multiple',
      stem: '下列哪些声明会创建块级作用域？',
      options: ['var', 'let', 'const', 'function'],
      answer: 'BC',
      explanation: 'let 与 const 都是块级作用域，var 是函数作用域。',
      difficulty: 1,
      tags: ['作用域'],
    },
    {
      type: 'judge',
      stem: '0.1 + 0.2 === 0.3 在 JavaScript 中成立。',
      options: ['正确', '错误'],
      answer: 'B',
      explanation: 'IEEE 754 浮点数存在精度误差，比较结果为 false。',
      difficulty: 2,
      tags: ['浮点数'],
    },
  ],
}

describe('parseImportJson', () => {
  it('parses a valid bank with letter answers', () => {
    const result = parseImportJson(JSON.stringify(validBank))
    expect(result.issues).toHaveLength(0)
    expect(result.questionCount).toBe(3)
    expect(result.bank?.questions[0].answer).toEqual([1])
    expect(result.bank?.questions[1].answer).toEqual([1, 2])
    expect(result.bank?.questions[2].type).toBe('judge')
    expect(result.bank?.level).toBe('入门')
    expect(result.bank?.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('reports invalid JSON with a parse error', () => {
    const result = parseImportJson('{ not json')
    expect(result.bank).toBeNull()
    expect(result.issues[0].field).toBe('file')
    expect(result.issues[0].message).toContain('JSON 解析失败')
  })

  it('rejects missing questions array', () => {
    const result = parseImportJson('{"title":"x"}')
    expect(result.bank).toBeNull()
    expect(result.issues[0].field).toBe('questions')
  })

  it('rejects empty questions and over-limit banks', () => {
    const empty = parseImportJson('{"title":"x","questions":[]}')
    expect(empty.bank).toBeNull()
    const tooMany = parseImportJson(
      JSON.stringify({ title: 'x', questions: Array.from({ length: 2001 }, () => validBank.questions[0]) }),
    )
    expect(tooMany.bank).toBeNull()
    expect(tooMany.issues[0].message).toContain('2000')
  })

  it('collects per-row issues without aborting the whole file', () => {
    const data = {
      title: '混合质量',
      questions: [
        ...validBank.questions,
        { stem: '没有选项的题', options: ['只有A'], answer: 'A', explanation: '解析内容足够长' },
        { stem: '答案越界', options: ['A', 'B'], answer: 'E', explanation: '解析内容足够长' },
        { stem: '缺答案', options: ['A', 'B'], answer: '', explanation: '解析内容足够长' },
        { type: 'single', stem: '多答案的单选', options: ['A', 'B', 'C'], answer: 'AB', explanation: '解析内容足够长' },
        { stem: '解析太短', options: ['A', 'B'], answer: 'A', explanation: '短' },
      ],
    }
    const result = parseImportJson(JSON.stringify(data))
    expect(result.questionCount).toBe(3)
    expect(result.issues.length).toBe(5)
    expect(result.issues.map((issue) => issue.line)).toEqual([4, 5, 6, 7, 8])
  })

  it('deduplicates repeated stems', () => {
    const data = {
      title: '重复题',
      questions: [validBank.questions[0], validBank.questions[0]],
    }
    const result = parseImportJson(JSON.stringify(data))
    expect(result.questionCount).toBe(1)
    expect(result.issues[0].message).toContain('重复')
  })
})

describe('parseImportCsv', () => {
  const header = 'stem,optionA,optionB,optionC,optionD,answer,explanation,type,difficulty,tags'

  it('parses quoted CSV rows', () => {
    const csv = [
      header,
      '"含,逗号的题干",甲,乙,丙,丁,B,"解析,里有逗号",single,2,标点;语法',
      '判断题干,正确,错误,,,B,判断解析内容足够,judge,1,基础',
    ].join('\n')
    const result = parseImportCsv(csv)
    expect(result.questionCount).toBe(2)
    expect(result.issues).toHaveLength(0)
    expect(result.bank?.questions[0].stem).toBe('含,逗号的题干')
    expect(result.bank?.questions[0].answer).toEqual([1])
    expect(result.bank?.questions[0].tags).toEqual(['标点', '语法'])
  })

  it('rejects missing columns', () => {
    const result = parseImportCsv('stem,optionA\n题干,A')
    expect(result.bank).toBeNull()
    expect(result.issues[0].field).toBe('header')
    expect(result.issues[0].message).toContain('optionB')
  })

  it('reports per-line issues with line numbers', () => {
    const csv = [header, '缺答案题干,A,B,C,D,,解析内容足够长,single,2,'].join('\n')
    const result = parseImportCsv(csv)
    expect(result.questionCount).toBe(0)
    expect(result.issues[0]).toMatchObject({ line: 2, field: 'answer' })
  })

  it('handles CRLF line endings', () => {
    const csv = [header, '回车题干,A,B,C,D,A,回车解析内容足够,single,1,'].join('\r\n')
    const result = parseImportCsv(csv)
    expect(result.questionCount).toBe(1)
  })
})

describe('helpers', () => {
  it('detects format by extension', () => {
    expect(detectFormat('bank.json')).toBe('json')
    expect(detectFormat('bank.CSV')).toBe('csv')
    expect(detectFormat('bank.xlsx')).toBe('xlsx')
    expect(detectFormat('题库.XLS')).toBe('xlsx')
  })

  it('builds stable unique ids from title', () => {
    const a = normalizeId('前端面试', 1)
    const b = normalizeId('前端面试', 2)
    expect(a.startsWith('6d3t3x6f4r4v6h4d4i6g4v45-1')).toBe(true)
    expect(b.startsWith('6d3t3x6f4r4v6h4d4i6g4v45-2')).toBe(true)
    expect(a).not.toBe(b)
    expect(normalizeId('!!!', 3)).toMatch(/^[a-z0-9-]*-3$/)
    expect(normalizeId('Front End', 4)).toMatch(/^front.*end-4$/)
  })
})

describe('detectFormatFromContent', () => {
  it('treats object and array payloads as JSON', () => {
    expect(detectFormatFromContent('{"title":"x"}')).toBe('json')
    expect(detectFormatFromContent('  [{"stem":"a"}]')).toBe('json')
  })

  it('treats everything else as CSV', () => {
    expect(detectFormatFromContent('stem,optionA\n题干,选项')).toBe('csv')
    expect(detectFormatFromContent('\n\nstem,answer')).toBe('csv')
  })
})

describe('parseImportCsv tolerance', () => {
  it('accepts a minimal header set without optional columns', () => {
    const csv = 'stem,optionA,optionB,answer,explanation\n1+1 等于几,1,2,B,基础加法运算'
    const result = parseImportCsv(csv)
    expect(result.bank).not.toBeNull()
    expect(result.questionCount).toBe(1)
    expect(result.issues).toHaveLength(0)
  })

  it('uses the title column to name the bank', () => {
    const csv = [
      'title,stem,optionA,optionB,answer,explanation',
      '小学数学,1+1 等于几,1,2,B,基础加法运算',
      '小学数学,2+2 等于几,3,4,B,基础加法运算',
    ].join('\n')
    expect(parseImportCsv(csv).bank?.title).toBe('小学数学')
  })

  it('parses multi-answer separators B;D and B,D and B、D', () => {
    for (const answer of ['B;D', 'B,D', 'B、D', 'B/D']) {
      const csv = [
        'stem,optionA,optionB,optionC,optionD,answer,explanation,type',
        `下列哪些是偶数,1,2,3,4,${answer},偶数定义说明,multiple`,
      ].join('\n')
      const result = parseImportCsv(csv)
      expect(result.bank?.questions[0].answer, answer).toEqual([1, 3])
    }
  })

  it('parses numeric answer indexes as 1-based positions', () => {
    const csv = 'stem,optionA,optionB,optionC,answer,explanation,type\n选两个,1,2,3,"1,3",多选说明,multiple'
    expect(parseImportCsv(csv).bank?.questions[0].answer).toEqual([0, 2])
  })

  it('reports a clear error when a required column is missing', () => {
    const result = parseImportCsv('stem,optionA,answer\n题干,选项,B')
    expect(result.bank).toBeNull()
    expect(result.issues[0].message).toContain('缺少必需列')
  })
})

describe('配图列', () => {
  const HEADERS_WITH_IMAGE = [
    'title', 'stem', 'optionA', 'optionB', 'answer', 'explanation', 'type', 'image',
  ]

  it('接受 https 外链与 data:image 内嵌', () => {
    const result = parseRows(HEADERS_WITH_IMAGE, [
      ['图解卷', '看图回答', '甲', '乙', 'A', '因为甲对', 'single', 'https://example.com/a.png'],
      ['图解卷', '再看一题', '甲', '乙', 'B', '因为乙对', 'single', 'data:image/png;base64,iVBORw0KGgo='],
    ])
    expect(result.questionCount).toBe(2)
    expect(result.bank?.questions[0].image).toBe('https://example.com/a.png')
    expect(result.bank?.questions[1].image).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('丢弃 javascript: 与 file: 等危险协议', () => {
    // 题干图会直接进 <img src>；放行 javascript: 等于把导入文件变成脚本入口。
    const result = parseRows(HEADERS_WITH_IMAGE, [
      ['危险卷', '注入尝试', '甲', '乙', 'A', '解析文字', 'single', 'javascript:alert(1)'],
      ['危险卷', '本地文件', '甲', '乙', 'A', '解析文字', 'single', 'file:///etc/passwd'],
      ['危险卷', '普通文本', '甲', '乙', 'A', '解析文字', 'single', 'not-a-url'],
    ])
    expect(result.questionCount).toBe(3)
    for (const question of result.bank!.questions) {
      expect(question.image).toBeUndefined()
    }
  })

  it('选项配图按选项顺序对齐，纯文字选项留空', () => {
    const headers = ['stem', 'optionA', 'optionB', 'answer', 'explanation', 'optionImageA']
    const result = parseRows(headers, [
      ['看图选', '甲', '乙', 'A', '解析文字', 'https://example.com/opt-a.png'],
    ])
    expect(result.bank?.questions[0].optionImages).toEqual([
      'https://example.com/opt-a.png',
      '',
    ])
  })

  it('全部选项都没有图时不产生 optionImages 字段', () => {
    const result = parseRows(['stem', 'optionA', 'optionB', 'answer', 'explanation'], [
      ['纯文字题', '甲', '乙', 'A', '解析文字'],
    ])
    expect(result.bank?.questions[0].optionImages).toBeUndefined()
  })

  it('normalizeImageSource 白名单边角', () => {
    expect(normalizeImageSource('HTTPS://EXAMPLE.COM/A.PNG')).toBe('HTTPS://EXAMPLE.COM/A.PNG')
    expect(normalizeImageSource('  https://a.com/b.png  ')).toBe('https://a.com/b.png')
    expect(normalizeImageSource('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      'data:image/svg+xml;base64,PHN2Zz4=',
    )
    expect(normalizeImageSource('data:text/html;base64,PHNjcmlwdD4=')).toBe('')
    expect(normalizeImageSource('vbscript:msgbox')).toBe('')
  })
})

describe('CSV 里的 data URI（未加引号）', () => {
  it('data:image 自带逗号，不能被切成两列', () => {
    // 真实场景：用户从 Excel 复制含图题目，data URI 没有加引号。
    // 逗号既存在于 data:image/png;base64, 之后，也可能出现在 base64 里。
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const csv = `title,stem,optionA,optionB,answer,explanation,type,image
图解题库,下图显示了什么,圆形,方形,A,图中是一个圆点,single,${png}`
    const result = parseImportCsv(csv)
    expect(result.questionCount).toBe(1)
    expect(result.bank?.questions[0].image).toBe(png)
  })

  it('加了引号的写法同样正确', () => {
    const png = 'data:image/png;base64,AAAA=='
    const csv = `title,stem,optionA,optionB,answer,explanation,type,image
图解题库,看图,甲,乙,A,解析文字,single,"${png}"`
    const result = parseImportCsv(csv)
    expect(result.bank?.questions[0].image).toBe(png)
  })

  it('普通题目不受影响（没有图片列时行为不变）', () => {
    const csv = `title,stem,optionA,optionB,answer,explanation
普通题库,一加一等于几,1,2,A,因为一加一等于二`
    const result = parseImportCsv(csv)
    expect(result.questionCount).toBe(1)
    expect(result.bank?.questions[0].image).toBeUndefined()
  })
})
