import type { Question, QuestionType } from '../data/types'

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export type SessionMode = 'practice' | 'exam' | 'review'

export interface Session {
  id: string
  mode: SessionMode
  collectionId: string
  questionIds: string[]
  answers: Record<string, number[]>
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

export function isCorrect(question: Question, selection: number[]): boolean {
  const picked = normalizeSelection(selection)
  const expected = normalizeSelection(question.answer)
  if (picked.length !== expected.length) return false
  return picked.every((value, index) => value === expected[index])
}

export function isAnswered(selection: number[] | undefined): boolean {
  return Array.isArray(selection) && selection.length > 0
}

export function typeLabel(type: QuestionType): string {
  switch (type) {
    case 'single':
      return '单选题'
    case 'multiple':
      return '多选题'
    case 'judge':
      return '判断题'
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
    if (!isAnswered(selection)) continue
    answered += 1
    if (isCorrect(question, selection)) correct += 1
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

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function dateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/**
 * 紧凑日期戳（`20261107`），用于导出文件名。
 *
 * 与 `dateKey` 同为本地时区语义。不要用 `toISOString().slice(0, 10)`：
 * 它是 UTC 日期，东八区晚上 8 点后就会落到第二天，文件名里的日期
 * 和用户以为的不一致。
 */
export function dateStamp(timestamp: number = Date.now()): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export function lastNDays(count: number, now: number = Date.now()): string[] {
  const keys: string[] = []
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(base)
    day.setDate(base.getDate() - i)
    keys.push(dateKey(day.getTime()))
  }
  return keys
}

export function streakFromDates(dates: Iterable<string>, now: number = Date.now()): number {
  const set = new Set(dates)
  let streak = 0
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!set.has(dateKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (set.has(dateKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
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
