import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { ReviewState, WrongEntry } from '../data/records'
import dayjs from './datetime'

// FSRS 调度只负责把「答错/答对」换成下次到期时间。算法用 ts-fsrs，
// 这里只做 Date 与毫秒时间戳的边界，避免 Date 过 IndexedDB/SQLite 后变形。
// 关掉 short_term：刷题不是 Anki 抽卡，答错隔天再练比一分钟后再弹更正常。
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false })

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

const grades: Record<ReviewGrade, Grade> = {
  again: Rating.Again as Grade,
  hard: Rating.Hard as Grade,
  good: Rating.Good as Grade,
  easy: Rating.Easy as Grade,
}

export function newReviewState(now: number = Date.now()): ReviewState {
  return fromCard(createEmptyCard(new Date(now)))
}

export function toCard(state: ReviewState): Card {
  const card: Card = {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
  }
  if (state.lastReview !== null) card.last_review = new Date(state.lastReview)
  return card
}

export function fromCard(card: Card): ReviewState {
  return {
    due: new Date(card.due).getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? new Date(card.last_review).getTime() : null,
  }
}

export function gradeReview(
  state: ReviewState | undefined,
  grade: ReviewGrade,
  now: number = Date.now(),
): ReviewState {
  const card = state ? toCard(state) : createEmptyCard(new Date(now))
  return fromCard(scheduler.next(card, new Date(now), grades[grade]).card)
}

/** 旧数据没有 FSRS 状态时，按 lastWrongAt 起算，立即进入待复习。 */
export function reviewStateOf(entry: WrongEntry): ReviewState {
  return entry.fsrs ?? newReviewState(entry.lastWrongAt)
}

export function isDue(entry: WrongEntry, now: number = Date.now()): boolean {
  return reviewStateOf(entry).due <= now
}

// 错题排序：先看到期，再看到底错了多少次。
// 2026-11-22 之前只按 lastWrongAt，用户反馈刚错的题反而排在后面；改成
// 到期组内按 wrongCount 降序后顺手多了。旧记录没有 fsrs 时用 lastWrongAt 补卡。
export function compareByDue(a: WrongEntry, b: WrongEntry, now: number = Date.now()): number {
  const dueA = reviewStateOf(a).due
  const dueB = reviewStateOf(b).due
  const aDue = dueA <= now
  const bDue = dueB <= now
  if (aDue !== bDue) return aDue ? -1 : 1
  if (aDue) return b.wrongCount - a.wrongCount
  return dueA - dueB
}

export function dueLabel(entry: WrongEntry, now: number = Date.now()): string {
  const due = reviewStateOf(entry).due
  if (due <= now) return '今天到期'
  return dayjs(due).from(dayjs(now))
}

export function dueCount(entries: WrongEntry[], now: number = Date.now()): number {
  return entries.filter((entry) => isDue(entry, now)).length
}

export function isMastered(state: ReviewState): boolean {
  return state.state === State.Review && state.scheduledDays >= 21
}

export { State }

export const ERROR_REASON_LABELS: Record<'concept' | 'method' | 'careless' | 'time', string> = {
  concept: '概念没懂',
  method: '方法不会',
  careless: '粗心看错',
  time: '时间不够',
}

export interface DueForecastDay {
  dateKey: string
  label: string
  count: number
  overdue: boolean
}

/**
 * 未来 N 天的到期分布。今天之前到期的统一压在「今天」，否则用户会被
 * 十几条已逾期记录吓到，反而不知道今天该做什么。
 */
export function dueForecast(
  entries: { fsrs?: { due?: number } }[],
  days = 7,
  now = Date.now(),
): DueForecastDay[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  const week = ['日', '一', '二', '三', '四', '五', '六']
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    return {
      dateKey: `${date.getMonth() + 1}/${date.getDate()}`,
      label: index === 0 ? '今天' : index === 1 ? '明天' : `周${week[date.getDay()]}`,
      count: 0,
      overdue: index === 0,
    } satisfies DueForecastDay
  })
  for (const entry of entries) {
    const due = entry.fsrs?.due ?? 0
    const offset = Math.max(0, Math.floor((due - start) / 86_400_000))
    if (offset < days) buckets[offset].count += 1
  }
  return buckets
}
