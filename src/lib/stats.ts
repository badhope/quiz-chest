import type { DailyStat, HistoryEntry } from '../data/records'
import { streakFromDates } from './datetime'
import { percent } from './quiz'

/**
 * 首页与统计页共用的累计口径。
 *
 * 以前两个页面各写一遍 reduce，改「累计作答是否包含未完成练习」
 * 这种口径要同步改两处，极易一边改一边漏。这里只做纯计算，
 * 不读 store，方便单测。
 */
export interface DailySummary {
  totalAnswered: number
  totalCorrect: number
  accuracy: number
  streak: number
}

export function summarizeDaily(
  daily: Record<string, DailyStat>,
  now: number = Date.now(),
): DailySummary {
  const entries = Object.values(daily)
  const totalAnswered = entries.reduce((sum, item) => sum + item.answered, 0)
  const totalCorrect = entries.reduce((sum, item) => sum + item.correct, 0)
  return {
    totalAnswered,
    totalCorrect,
    accuracy: percent(totalCorrect, totalAnswered),
    streak: streakFromDates(Object.keys(daily), now),
  }
}

export interface HistorySummary {
  totalMinutes: number
  answeredCount: number
  bestAccuracy: number
}

export function summarizeHistory(history: readonly HistoryEntry[]): HistorySummary {
  return {
    totalMinutes: Math.round(
      history.reduce((sum, entry) => sum + entry.durationSec, 0) / 60,
    ),
    answeredCount: history.reduce((sum, entry) => sum + entry.answered, 0),
    bestAccuracy: history.reduce((best, entry) => Math.max(best, entry.accuracy), 0),
  }
}
