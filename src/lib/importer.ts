import type { Difficulty, QuestionSeed, QuestionType } from '../data/types'

export interface ImportBankInput {
  title: string
  subtitle: string
  description: string
  exam: string
  icon: string
  accent: string
  level: '入门' | '进阶' | '挑战'
  durationMin: number
  tags: string[]
  questions: ImportQuestionInput[]
}

export interface ImportQuestionInput {
  type: QuestionType
  stem: string
  options: string[]
  answer: number[]
  explanation: string
  difficulty: Difficulty
  tags: string[]
  image?: string
  optionImages?: string[]
}

export interface ImportIssue {
  line: number
  field: string
  message: string
}

export interface ParseResult {
  bank: ImportBankInput | null
  issues: ImportIssue[]
  questionCount: number
}

const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'judge']
const LEVELS = ['入门', '进阶', '挑战'] as const
const ACCENTS = [
  '#315B7D', '#B45309', '#6E4B8A', '#1F7A5C', '#3E4C59', '#9A3B32', '#7A5C2E',
]

/** CSV 可识别的列。`title` 用于给整份 CSV 命名，避免全部落成「未命名题库」。 */
const HEADERS = [
  'title', 'stem', 'optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF',
  'answer', 'explanation', 'type', 'difficulty', 'tags',
  // 配图列：image 是题干图（URL 或 data URI），optionImageA..F 是选项图。
  'image', 'optionImageA', 'optionImageB', 'optionImageC', 'optionImageD',
  'optionImageE', 'optionImageF',
] as const

/** 只有这几列是必须的；其余列缺省时走默认值。 */
const REQUIRED_HEADERS = ['stem', 'optionA', 'optionB', 'answer', 'explanation'] as const

const OPTION_KEYS = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF'] as const

export function normalizeId(rawTitle: string, salt: number): string {
  const slug = rawTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, (match) => {
      let encoded = ''
      for (const ch of new TextEncoder().encode(match)) encoded += ch.toString(36)
      return encoded
    })
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const safe = slug.length > 0 ? slug : 'bank'
  return `${safe}-${salt.toString(36)}`
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

/**
 * 解析答案列。接受以下几种常见写法，避免用户因为分隔符被迫改表：
 *   `B` / `BC` / `B,C` / `B;D` / `B、D` / `B D` / `B/D` / `1`（下标）
 * 下标写法 1 表示第一个选项，与字母 A 等价。
 */
function parseAnswer(raw: unknown, optionCount: number, line: number, issues: ImportIssue[]): number[] {
  const text = asString(raw).toUpperCase().replace(/\s+/g, '')
  if (!text) {
    issues.push({ line, field: 'answer', message: '缺少答案' })
    return []
  }

  // 分隔符统一后逐段解析：字母段可含多个字母（如 BC），数字段视为下标。
  const tokens = text.split(/[,;、/|]+/).filter(Boolean)
  const indexes: number[] = []
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const asIndex = Number(token) - 1
      if (asIndex < 0 || asIndex >= optionCount) {
        issues.push({
          line,
          field: 'answer',
          message: `答案序号 ${token} 超出选项范围（1-${optionCount}）`,
        })
        return []
      }
      if (!indexes.includes(asIndex)) indexes.push(asIndex)
      continue
    }
    for (const char of token) {
      const index = char.charCodeAt(0) - 65
      if (index < 0 || index >= optionCount) {
        issues.push({
          line,
          field: 'answer',
          message: `答案 ${char} 超出选项范围（A-${String.fromCharCode(64 + optionCount)}）`,
        })
        return []
      }
      if (!indexes.includes(index)) indexes.push(index)
    }
  }
  return indexes.sort((a, b) => a - b)
}

function normalizeQuestionRow(raw: unknown, line: number, issues: ImportIssue[]): ImportQuestionInput | null {
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ line, field: 'row', message: '题目必须是对象' })
    return null
  }
  const item = raw as Record<string, unknown>
  let row = item
  if (Array.isArray(item.options)) {
    const normalized: Record<string, unknown> = { ...item }
    item.options.slice(0, 6).forEach((value, index) => {
      normalized[OPTION_KEYS[index]] = value
    })
    delete normalized.options
    row = normalized
  }
  return seedFromRow(row, line, issues)
}

/**
 * 校验单题行并归一化。
 *
 * 供两条入口共用：CSV / Excel 行管线，以及题库编辑器（编辑器把表单字段
 * 拼成同样的 row 形状）。line 用于错误定位；编辑器传 0 即可。
 */
export function buildQuestionSeed(
  row: Record<string, unknown>,
  line: number,
  issues: ImportIssue[],
): ImportQuestionInput | null {
  return seedFromRow(row, line, issues)
}

function seedFromRow(row: Record<string, unknown>, line: number, issues: ImportIssue[]): ImportQuestionInput | null {
  const stem = asString(row.stem)
  if (!stem) {
    issues.push({ line, field: 'stem', message: '缺少题干' })
    return null
  }
  const options: string[] = []
  for (const key of OPTION_KEYS) {
    const value = asString(Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined)
    if (value) options.push(value)
  }
  if (options.length < 2) {
    issues.push({ line, field: 'options', message: '选项少于 2 个' })
    return null
  }
  const typeRaw = asString(row.type).toLowerCase() || 'single'
  if (!QUESTION_TYPES.includes(typeRaw as QuestionType)) {
    issues.push({ line, field: 'type', message: `题型 ${row.type as string} 不合法（single/multiple/judge）` })
    return null
  }
  const type = typeRaw as QuestionType
  const answer = parseAnswer(row.answer, options.length, line, issues)
  if (answer.length === 0) return null
  if (type !== 'multiple' && answer.length > 1) {
    issues.push({ line, field: 'answer', message: `${type} 题型只能有一个答案` })
    return null
  }
  if (type === 'judge' && options.length !== 2) {
    issues.push({ line, field: 'options', message: '判断题必须恰好 2 个选项' })
    return null
  }
  const explanation = asString(row.explanation)
  if (explanation.length < 4) {
    issues.push({ line, field: 'explanation', message: '解析过短（至少 4 个字符）' })
    return null
  }
  const difficultyRaw = Number(row.difficulty ?? 2)
  const difficulty: Difficulty = difficultyRaw === 1 || difficultyRaw === 3 ? difficultyRaw : 2
  const tags = asString(row.tags)
    ? asString(row.tags).split(/[;；|]/).map((tag) => tag.trim()).filter(Boolean)
    : []

  // 配图：只接受 http(s) 外链与 data:image 内嵌两种形式。
  // 其他协议（javascript:, file:）一律丢弃——它们要么是 XSS 载体，
  // 要么在 WebView 里根本加载不出来，静默保留只会变成坏图。
  const image = normalizeImageSource(asString(row.image))
  const optionImages: string[] = []
  for (let i = 0; i < options.length; i += 1) {
    optionImages.push(normalizeImageSource(asString(row[`optionImage${String.fromCharCode(65 + i)}`])))
  }
  const hasOptionImages = optionImages.some(Boolean)

  return {
    type,
    stem,
    options,
    answer,
    explanation,
    difficulty,
    tags,
    ...(image ? { image } : {}),
    ...(hasOptionImages ? { optionImages } : {}),
  }
}

function normalizeMeta(raw: Record<string, unknown>): Pick<
  ImportBankInput,
  'title' | 'subtitle' | 'description' | 'exam' | 'icon' | 'accent' | 'level' | 'durationMin' | 'tags'
> {
  const title = asString(raw.title) || '未命名题库'
  const levelRaw = asString(raw.level)
  const level = (LEVELS as readonly string[]).includes(levelRaw)
    ? (levelRaw as ImportBankInput['level'])
    : '入门'
  const durationRaw = Number(raw.durationMin)
  const accentRaw = asString(raw.accent)
  return {
    title,
    subtitle: asString(raw.subtitle) || '导入题库',
    description: asString(raw.description) || '通过导入功能创建的题库。',
    exam: asString(raw.exam) || title,
    icon: asString(raw.icon) || 'book',
    accent: /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : ACCENTS[Math.abs(hashCode(title)) % ACCENTS.length],
    level,
    durationMin: Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(300, Math.round(durationRaw)) : Math.max(5, 10),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map(asString).filter(Boolean)
      : asString(raw.tags).split(/[;；|]/).map((tag) => tag.trim()).filter(Boolean),
  }
}

/**
 * 白名单校验图片来源。
 *
 * 为什么必须做：题干图会直接进 `<img src>`。允许 `javascript:` 之类的协议
 * 等于把导入文件变成脚本执行入口；允许 `file:` 则在 WebView 里必然坏图。
 * 只放行 http/https 与 data:image，其余一律当作「没有图」。
 */
export function normalizeImageSource(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value
  return ''
}

export function hashCode(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return hash
}

export function parseImportJson(raw: string): ParseResult {
  const issues: ImportIssue[] = []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return {
      bank: null,
      issues: [{ line: 0, field: 'file', message: `JSON 解析失败：${error instanceof Error ? error.message : '未知错误'}` }],
      questionCount: 0,
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { bank: null, issues: [{ line: 0, field: 'file', message: '顶层必须是对象 { title, questions: [...] }' }], questionCount: 0 }
  }
  const root = data as Record<string, unknown>
  const rawQuestions = root.questions
  if (!Array.isArray(rawQuestions)) {
    return { bank: null, issues: [{ line: 0, field: 'questions', message: '缺少 questions 数组' }], questionCount: 0 }
  }
  if (rawQuestions.length === 0) {
    return { bank: null, issues: [{ line: 0, field: 'questions', message: 'questions 数组为空' }], questionCount: 0 }
  }
  if (rawQuestions.length > 2000) {
    return { bank: null, issues: [{ line: 0, field: 'questions', message: '单次最多导入 2000 题' }], questionCount: 0 }
  }
  const seen = new Set<string>()
  const questions: ImportQuestionInput[] = []
  rawQuestions.forEach((item, index) => {
    const line = index + 1
    const seed = normalizeQuestionRow(item, line, issues)
    if (!seed) return
    const dedupe = seed.stem
    if (seen.has(dedupe)) {
      issues.push({ line, field: 'stem', message: '题干与前面某题重复，已跳过' })
      return
    }
    seen.add(dedupe)
    questions.push(seed)
  })
  if (questions.length === 0) {
    return { bank: null, issues, questionCount: 0 }
  }
  const meta = normalizeMeta(root)
  return { bank: { ...meta, questions }, issues, questionCount: questions.length }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

/**
 * 修复未加引号的多选答案。
 *
 * `answer` 写成 `B,D` 但没加引号时，CSV 会把它拆成两列，导致后续列整体右移、
 * 题型被读成题干。这里只在「答案列恰好是单个 A-F 字母，紧随其后的多余列
 * 也都是单个 A-F 字母」时合并回去，避免误伤正常的宽表。
 */
/**
 * 合并被逗号切开的 data URI。
 *
 * `data:image/png;base64,AAAA` 里自带一个逗号。CSV 规范要求这种字段加引号，
 * 但用户从 Excel 复制过来通常没有，于是单元格被多切一刀，图片列拿到
 * `data:image/png;base64`、后面的 base64 掉到下一列。
 *
 * 处理方式：只对「以 data:image 开头且还没结束」的单元格，把它与后续单元格
 * 用逗号拼回去，直到出现的片段以 base64 合法字符结尾为止。
 * 只影响图片列，不动其它字段，避免把有意的空列合并掉。
 */
function repairSplitDataUri(cells: string[]): string[] {
  const result = [...cells]
  for (let i = 0; i < result.length; i += 1) {
    const value = result[i] ?? ''
    if (!/^data:image\//i.test(value.trim())) continue
    // 完整的 data URI 一定含有「;base64,」且逗号后有内容。
    if (/^data:image\/[^,]+;base64,.+/i.test(value.trim())) continue
    // 被切断：把后面的片段拼回来，最多再吃 3 段（base64 里再出现逗号极罕见）。
    let merged = value
    let consumed = 0
    while (consumed < 3 && i + 1 + consumed < result.length) {
      const next = result[i + 1 + consumed]
      merged = `${merged},${next}`
      consumed += 1
      if (/^data:image\/[^,]+;base64,[A-Za-z0-9+/=]+$/i.test(merged.trim())) break
    }
    if (consumed > 0 && /^data:image\/[^,]+;base64,/i.test(merged.trim())) {
      result.splice(i, 1 + consumed, merged)
    }
  }
  return result
}

function repairUnquotedAnswer(
  cells: string[],
  headers: string[],
): string[] {
  const repaired = repairSplitDataUri(cells)
  if (repaired.length <= headers.length) return repaired
  const cells2 = repaired
  if (cells2.length <= headers.length) return cells2
  const answerIndex = headers.findIndex((header) => header.toLowerCase() === 'answer')
  if (answerIndex < 0) return cells2
  const extra = cells2.length - headers.length
  const answerCell = (cells2[answerIndex] ?? '').trim()
  if (!/^[A-Fa-f]$/.test(answerCell)) return cells2
  const overflow = cells2.slice(answerIndex + 1, answerIndex + 1 + extra)
  if (overflow.length !== extra) return cells2
  if (!overflow.every((cell) => /^[A-Fa-f]$/.test(cell.trim()))) return cells2
  const merged = [...cells2]
  merged.splice(answerIndex, 1 + extra, [answerCell, ...overflow.map((c) => c.trim())].join(','))
  return merged
}

export function parseImportCsv(raw: string): ParseResult {
  const issues: ImportIssue[] = []
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').filter((line, index, all) =>
    !(index === all.length - 1 && line.trim() === ''),
  )
  if (lines.length < 2) {
    return { bank: null, issues: [{ line: 1, field: 'file', message: 'CSV 至少需要表头 + 1 行数据' }], questionCount: 0 }
  }
  const headers = splitCsvLine(lines[0]).map((cell) => cell.trim())
  const rows = lines.slice(1).map((line) => repairUnquotedAnswer(splitCsvLine(line), headers))
  return parseRows(headers, rows, issues)
}

/**
 * 行数据统一入口：CSV 与 Excel 都归一化成「表头 + 字符串二维表」后走这里。
 *
 * 为什么抽这一层：Excel 解析和 CSV 解析的差异只在「怎么拿到单元格」，
 * 表头校验、逐行题目校验、重名跳过这些规则必须只有一份实现，
 * 否则两边会各自漂移（比如 Excel 能导而 CSV 不能导的题）。
 */
export function parseRows(
  headers: string[],
  rows: string[][],
  issues: ImportIssue[] = [],
): ParseResult {
  const headerSet = new Set(headers.map((cell) => cell.trim().toLowerCase()))
  const missing = REQUIRED_HEADERS.filter((header) => !headerSet.has(header.toLowerCase()))
  if (missing.length > 0) {
    return {
      bank: null,
      issues: [
        ...issues,
        { line: 1, field: 'header', message: `缺少必需列：${missing.join(', ')}` },
      ],
      questionCount: 0,
    }
  }

  const normalizedHeaders = headers.map((header) =>
    HEADERS.find((candidate) => candidate.toLowerCase() === header.trim().toLowerCase()),
  )

  const seen = new Set<string>()
  const questions: ImportQuestionInput[] = []
  // title 列可选：所有行取第一个非空值作为题库名。
  let bankTitle = ''
  rows.forEach((cells, rowIndex) => {
    const row: Record<string, unknown> = {}
    normalizedHeaders.forEach((key, index) => {
      if (key) row[key] = cells[index] ?? ''
    })
    if (!bankTitle) bankTitle = asString(row.title)
    const line = rowIndex + 2 // 表头占第 1 行
    const seed = seedFromRow(row, line, issues)
    if (!seed) return
    if (seen.has(seed.stem)) {
      issues.push({ line, field: 'stem', message: '题干重复，已跳过' })
      return
    }
    seen.add(seed.stem)
    questions.push(seed)
  })
  if (questions.length === 0) {
    return { bank: null, issues, questionCount: 0 }
  }
  const meta = normalizeMeta(bankTitle ? { title: bankTitle } : {})
  return { bank: { ...meta, questions }, issues, questionCount: questions.length }
}

/** Excel 工作表（每格已转成字符串）走与 CSV 相同的行管线。 */
export function parseImportSheet(headers: string[], rows: string[][]): ParseResult {
  return parseRows(headers, rows)
}

export type ImportFormat = 'json' | 'csv' | 'xlsx'

export function detectFormat(fileName: string): ImportFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx'
  return null
}

/**
 * 按内容推断格式，供「直接粘贴」场景使用。
 *
 * 粘贴时没有文件名可用，只能看首字符：以 `{` 或 `[` 开头视为 JSON，
 * 否则按 CSV 处理。否则用户粘贴 CSV 会被强制当作 JSON 解析而失败。
 */
export function detectFormatFromContent(raw: string): ImportFormat {
  const head = raw.trimStart()
  if (head.startsWith('{') || head.startsWith('[')) return 'json'
  return 'csv'
}

export function toQuestionSeeds(questions: ImportQuestionInput[]): QuestionSeed[] {
  return questions
}
