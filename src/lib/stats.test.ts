import { describe, expect, it } from 'vitest'
import type { DailyStat, HistoryEntry } from '../data/records'
import { summarizeDaily, summarizeHistory } from './stats'

const daily: Record<string, DailyStat> = {
  '2026-11-21': { date: '2026-11-21', answered: 20, correct: 14 },
  '2026-11-22': { date: '2026-11-22', answered: 10, correct: 9 },
}

const history: HistoryEntry[] = [
  {
    id: 'h1', mode: 'practice', collectionId: 'a', collectionTitle: 'A',
    answered: 10, correct: 7, wrong: 3, skipped: 0, total: 10,
    accuracy: 70, durationSec: 120, finishedAt: 2000, dateKey: '2026-11-22',
  },
  {
    id: 'h2', mode: 'exam', collectionId: 'b', collectionTitle: 'B',
    answered: 5, correct: 5, wrong: 0, skipped: 0, total: 5,
    accuracy: 100, durationSec: 180, finishedAt: 3000, dateKey: '2026-11-22',
  },
]

describe('统计口径', () => {
  it('每日统计累计作答、正确率与连续天数', () => {
    const summary = summarizeDaily(daily, new Date(2026, 10, 22).getTime())
    expect(summary.totalAnswered).toBe(30)
    expect(summary.totalCorrect).toBe(23)
    expect(summary.accuracy).toBe(77)
    expect(summary.streak).toBe(2)
  })

  it('历史汇总时长、作答量与最佳正确率', () => {
    expect(summarizeHistory(history)).toEqual({
      totalMinutes: 5,
      answeredCount: 15,
      bestAccuracy: 100,
    })
  })

  it('空数据不产生 NaN', () => {
    expect(summarizeDaily({}, new Date(2026, 10, 22).getTime())).toEqual({
      totalAnswered: 0,
      totalCorrect: 0,
      accuracy: 0,
      streak: 0,
    })
    expect(summarizeHistory([])).toEqual({ totalMinutes: 0, answeredCount: 0, bestAccuracy: 0 })
  })
})
