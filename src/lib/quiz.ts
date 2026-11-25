import type { Question, QuestionType } from '../data/types'

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export type SessionMode = 'practice' | 'exam' | 'review'

export const SESSION_MODE_LABELS: Record<SessionMode, string> = {
  practice: '顺序练习',
  exam: '模拟考试',
  review: '错题重练',
}

export function parseSessionMode(
  value: string | null | undefined,
  fallback: SessionMode = 'practice',
): SessionMode {
  if (value === 'exam' || value === 'review') return value
  return fallback
}

export function sessionModeLabel(mode: SessionMode): string {
  return SESSION_MODE_LABELS[mode]
}

export interface Session {
  id: string
  mode: SessionMode
  collectionId: string
  questionIds: string[]
  answers: Record<string, number[]>
  textAnswers?: Record<string, string>
  startedAt: number
  finishedAt: number | null
}

export interface SessionSummary {
  answered: number
  total: number
  correct: number
  wrong: number
  skipped: number
  accuracy: number
  durationSec: number
}

export function normalizeSelection(selection: number[]): number[] {
  return [...new Set(selection)].sort((a, b) => a - b)
}

/** 文本题归一化：全半角、大小写、空白和常见标点不参与判分。 */
export function normalizeAnswerText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？；：、,.!?;:""''“”‘’（）()【】《》<>…—-]/g, '')
}

/**
 * 判分。选择题比较选项下标；填空题命中任一可接受答案；简答题要求
 * 全部关键词出现。简答没有配置关键词时退回参考答案全等，导入时会提示。
 */
export function isCorrect(question: Question, selection: number[], textAnswer = ''): boolean {
  if (question.type === 'fill') {
    const submitted = normalizeAnswerText(textAnswer)
    if (!submitted) return false
    return (question.answerText ?? []).some((answer) => normalizeAnswerText(answer) === submitted)
  }
  if (question.type === 'short') {
    const submitted = normalizeAnswerText(textAnswer)
    if (!submitted) return false
    const keywords = (question.keywords ?? []).map(normalizeAnswerText).filter(Boolean)
    if (keywords.length > 0) return keywords.every((keyword) => submitted.includes(keyword))
    return (question.answerText ?? []).some((answer) => normalizeAnswerText(answer) === submitted)
  }
  const picked = normalizeSelection(selection)
  const expected = normalizeSelection(question.answer)
  if (picked.length !== expected.length) return false
  return picked.every((value, index) => value === expected[index])
}

export function isAnswered(selection: number[] | undefined, textAnswer = ''): boolean {
  return (Array.isArray(selection) && selection.length > 0) || textAnswer.trim().length > 0
}

/** 答案的展示文本：选择题输出字母，文本题输出参考答案。 */
export function answerLabel(question: Question): string {
  if (question.type === 'fill' || question.type === 'short') {
    return (question.answerText ?? []).join(' / ')
  }
  return question.answer.map((value) => LETTERS[value] ?? String(value + 1)).join('、')
}

export function typeLabel(type: QuestionType): string {
  switch (type) {
    case 'single':
      return '单选题'
    case 'multiple':
      return '多选题'
    case 'judge':
      return '判断题'
    case 'fill':
      return '填空题'
    case 'short':
      return '简答题'
  }
}

export function createSession(params: {
  mode: SessionMode
  collectionId: string
  questionIds: string[]
  now?: number
}): Session {
  const now = params.now ?? Date.now()
  return {
    id: `s_${now}_${Math.random().toString(36).slice(2, 8)}`,
    mode: params.mode,
    collectionId: params.collectionId,
    questionIds: params.questionIds,
    answers: {},
    textAnswers: {},
    startedAt: now,
    finishedAt: null,
  }
}

export function summarizeSession(
  session: Session,
  questions: Question[],
  now: number = Date.now(),
): SessionSummary {
  let correct = 0
  let answered = 0
  for (const question of questions) {
    const selection = session.answers[question.id]
    const textAnswer = session.textAnswers?.[question.id]
    if (!isAnswered(selection, textAnswer)) continue
    answered += 1
    if (isCorrect(question, selection, textAnswer)) correct += 1
  }
  const total = questions.length
  const end = session.finishedAt ?? now
  return {
    answered,
    total,
    correct,
    wrong: answered - correct,
    skipped: total - answered,
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    durationSec: Math.max(0, Math.round((end - session.startedAt) / 1000)),
  }
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}
