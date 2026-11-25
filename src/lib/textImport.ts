import type { QuestionType } from '../data/types'
import { parseRows, type ImportIssue, type ParseResult } from './importer'

const MAX_QUESTIONS = 2000
const QUESTION_HEADERS = [
  'title', 'stem',
  'optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF',
  'answer', 'explanation', 'type', 'difficulty', 'tags',
] as const

const QUESTION_START = /^\s*(?:第\s*)?(\d{1,4})\s*(?:题\s*)?[.、)．:：]\s*(.+)$/
const QUESTION_START_WORD = /^\s*第\s*(\d{1,4})\s*题\s*[:：、.]?\s*(.+)$/
const OPTION_LINE = /^\s*([A-Fa-f])\s*[.、)．:：]\s*(.+)$/
const ANSWER_LINE = /^\s*(?:【)?(?:参考)?答案(?:】)?\s*[：:]\s*(.+)$/
const EXPLANATION_LINE = /^\s*(?:【)?(?:答案)?解析(?:】)?\s*[：:]\s*(.*)$/
const TAGS_LINE = /^\s*(?:【)?(?:标签|考点)(?:】)?\s*[：:]\s*(.+)$/
const DIFFICULTY_LINE = /^\s*(?:【)?难度(?:】)?\s*[：:]\s*([123])\s*$/
const TYPE_LINE = /^\s*(?:【)?题型(?:】)?\s*[：:]\s*(.+)$/
const TYPE_PREFIX = /^[【（(]\s*(单选题?|多选题?|判断题?|选择|填空|简答)\s*[】\]）)]\s*/

interface TextQuestionBlock {
  line: number
  type?: QuestionType
  stem: string
  options: string[]
  answer: string
  explanation: string
  tags: string[]
  difficulty: 1 | 2 | 3
}

function typeFromText(value: string): QuestionType | null {
  const text = value.trim().toLowerCase()
  if (/^(单选|单选题|single|choice)$/.test(text)) return 'single'
  if (/^(多选|多选题|multiple)$/.test(text)) return 'multiple'
  if (/^(判断|判断题|judge|true.?false)$/.test(text)) return 'judge'
  return null
}

function normalizeAnswer(raw: string, options: string[]): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^[A-Fa-f]+$/.test(value)) return value.toUpperCase()
  const separated = value.match(/^[A-Fa-f](?:\s*[、,，;；|]\s*[A-Fa-f])+$/)
  if (separated) return value.replace(/[^A-Fa-f]/g, '').toUpperCase()
  if (/^(正确|对|是|√|true|t)$/i.test(value)) return 'A'
  if (/^(错误|错|否|×|false|f)$/i.test(value)) return 'B'
  const exact = options.findIndex((option) => option.trim() === value)
  if (exact >= 0) return String.fromCharCode(65 + exact)
  return ''
}

function buildBlock(block: TextQuestionBlock, title: string, issues: ImportIssue[]): string[] | null {
  const answer = normalizeAnswer(block.answer, block.options)
  if (!answer) {
    issues.push({ line: block.line, field: 'answer', message: '答案无法匹配到 A-F 选项，已跳过' })
    return null
  }
  let options = block.options
  const rawAnswer = block.answer.trim()
  if (options.length === 0 && (/^[【（(]?判断/.test(block.stem) || /^(正确|对|错误|错|√|×|true|false|t|f)$/i.test(rawAnswer))) {
    options = ['正确', '错误']
  }
  if (options.length < 2) {
    issues.push({ line: block.line, field: 'options', message: '选项少于 2 个，已跳过' })
    return null
  }
  if (options.length > 6) {
    issues.push({ line: block.line, field: 'options', message: '文本模板一次最多 6 个选项，已跳过' })
    return null
  }
  const inferredType: QuestionType = block.type
    ? (block.type === 'single' && answer.length > 1 ? 'multiple' : block.type)
    : answer.length > 1
      ? 'multiple'
      : (options.length === 2 && /^(正确|对)$/.test(options[0]) && /^(错误|错)$/.test(options[1]) ? 'judge' : 'single')
  const padding = [...options]
  while (padding.length < 6) padding.push('')
  return [
    title,
    block.stem,
    ...padding,
    answer,
    block.explanation || '文本导入时未提供解析。',
    inferredType,
    String(block.difficulty),
    block.tags.join(';'),
  ]
}

/**
 * 解析 Word/TXT/Markdown 里的题号模板：
 *
 *   1. 题干
 *   A. 选项
 *   B. 选项
 *   答案：B
 *   解析：...
 *
 * 只做模板级解析，不假装能读懂任意排版。缺失解析会补一句占位并给提示，
 * 缺答案或选项不足则跳过该题，交给预览页逐条展示。
 */
export function parseTextImport(raw: string, fileName = '粘贴内容.txt'): ParseResult {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '\n')
  if (!text.trim()) {
    return { bank: null, issues: [{ line: 0, field: 'file', message: '文件内容为空' }], questionCount: 0 }
  }

  const lines = text.split('\n')
  const issues: ImportIssue[] = []
  let title = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const heading = trimmed.match(/^#+\s*(.+)$/)
    if (heading) {
      title = heading[1].trim()
      break
    }
    const named = trimmed.match(/^(?:题库|题库名|标题)\s*[：:]\s*(.+)$/)
    if (named) {
      title = named[1].trim()
      break
    }
    const english = trimmed.match(/^title\s*[：:]\s*(.+)$/i)
    if (english) {
      title = english[1].trim()
      break
    }
    if (QUESTION_START.test(trimmed) || QUESTION_START_WORD.test(trimmed)) break
  }
  if (!title) title = fileName.replace(/\.[^.]+$/, '').trim() || '文本导入题库'

  const blocks: TextQuestionBlock[] = []
  let current: TextQuestionBlock | null = null
  let inExplanation = false

  const flush = () => {
    if (!current) return
    const stem = current.stem.trim()
    if (!stem) {
      issues.push({ line: current.line, field: 'stem', message: '题干为空，已跳过' })
      current = null
      return
    }
    if (!current.answer.trim()) {
      issues.push({ line: current.line, field: 'answer', message: '缺少答案，已跳过' })
      current = null
      return
    }
    current.stem = stem
    blocks.push(current)
    current = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      inExplanation = false
      continue
    }
    if (/^#{1,6}\s/.test(trimmed) && !QUESTION_START.test(trimmed)) {
      if (current) flush()
      continue
    }
    const start = trimmed.match(QUESTION_START_WORD) ?? trimmed.match(QUESTION_START)
    if (start) {
      if (current) flush()
      const stem = start[2].trim()
      const prefix = stem.match(TYPE_PREFIX)
      current = {
        line: index + 1,
        type: prefix ? typeFromText(prefix[1]) ?? undefined : undefined,
        stem: prefix ? stem.replace(TYPE_PREFIX, '').trim() : stem,
        options: [],
        answer: '',
        explanation: '',
        tags: [],
        difficulty: 2,
      }
      inExplanation = false
      continue
    }
    if (!current) continue

    const typeLine = trimmed.match(TYPE_LINE)
    if (typeLine) {
      current.type = typeFromText(typeLine[1]) ?? current.type
      continue
    }
    const option = trimmed.match(OPTION_LINE)
    if (option) {
      const letterIndex = option[1].toUpperCase().charCodeAt(0) - 65
      while (current.options.length < letterIndex) current.options.push('')
      current.options[letterIndex] = option[2].trim()
      inExplanation = false
      continue
    }
    const answer = trimmed.match(ANSWER_LINE)
    if (answer) {
      current.answer = answer[1].trim()
      inExplanation = false
      continue
    }
    const explanation = trimmed.match(EXPLANATION_LINE)
    if (explanation) {
      current.explanation = explanation[1].trim()
      inExplanation = true
      continue
    }
    const tags = trimmed.match(TAGS_LINE)
    if (tags) {
      current.tags = tags[1].split(/[;；|]/).map((tag) => tag.trim()).filter(Boolean)
      inExplanation = false
      continue
    }
    const difficulty = trimmed.match(DIFFICULTY_LINE)
    if (difficulty) {
      current.difficulty = Number(difficulty[1]) as 1 | 2 | 3
      inExplanation = false
      continue
    }
    if (inExplanation) {
      current.explanation = `${current.explanation}${current.explanation ? '\n' : ''}${trimmed}`
    }
  }
  flush()

  if (blocks.length === 0) {
    return {
      bank: null,
      issues: [...issues, { line: 0, field: 'file', message: '没有识别到题目。请按“1. 题干 / A. 选项 / 答案：B / 解析：…”的题号模板书写。' }],
      questionCount: 0,
    }
  }
  if (blocks.length > MAX_QUESTIONS) {
    return {
      bank: null,
      issues: [{ line: 0, field: 'file', message: `识别到 ${blocks.length} 题，单次最多导入 ${MAX_QUESTIONS} 题，请拆分文件。` }],
      questionCount: 0,
    }
  }

  const rows: string[][] = []
  for (const block of blocks) {
    const row = buildBlock(block, title, issues)
    if (row) rows.push(row)
  }
  if (rows.length === 0) return { bank: null, issues, questionCount: 0 }

  const result = parseRows([...QUESTION_HEADERS], rows, issues)
  if (result.bank) {
    result.bank = {
      ...result.bank,
      title,
      subtitle: '文本导入',
      description: '从 Word / TXT / Markdown 题号模板导入的题库。',
    }
  }
  return result
}

export const TEXT_IMPORT_TEMPLATE = `# 我的题库

1. 下列哪个是质数？
A. 4
B. 6
C. 7
D. 9
答案：C
解析：4、6、9 都有除 1 和自身以外的因数，7 只有 1 和 7 两个正因数。
难度：1
考点：质数

2. 下列哪些属于哺乳动物？【多选】
A. 猫
B. 鲸
C. 鸡
D. 蝙蝠
答案：A、B、D
解析：猫、鲸、蝙蝠都是哺乳动物；鸡是鸟类。
难度：2
考点：动物分类
`
