import type { Question, QuestionType } from '../data/types'

export { dateKey, dateStamp, formatRelativeTime, lastNDays, streakFromDates } from './datetime'

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
