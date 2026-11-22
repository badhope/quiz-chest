import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { ReviewState, WrongEntry } from '../data/records'
import dayjs from './datetime'

/**
 * FSRS 复习调度。
 *
 * 只做一件事：把「答错/答对」翻译成下一次到期时间。算法本身交给
 * `ts-fsrs`（FSRS-6 官方实现），这里只负责 Date ↔ 毫秒时间戳的边界转换，
 * 避免 Date 在 IndexedDB / SQLite / JSON 之间来回变形。
 *
 * 关闭 short-term：这是刷题应用，不是每分钟抽卡的 Anki。答错后隔天再练
 * 比一分钟后再弹一次更符合使用场景，也避免「刚做完就提示到期」的怪循环。
 */
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

/** 到期优先，其次错误次数；首页与错题复习共用同一套排序。 */
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
