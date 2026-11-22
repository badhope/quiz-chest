import type { DailyStat, HistoryEntry } from '../data/records'
import { HISTORY_LIMIT } from '../services/repository'

/**
 * 练习记录的唯一内存合并规则。
 *
 * 同一 id 重放时必须覆盖旧记录并回退旧的每日统计，再计入新值；
 * 否则重试一次就会把「累计作答」加两遍。store 与内存仓储共用这里，
 * IndexedDB / SQLite 在各自事务里实现同样的加减。
 */
export function mergeHistoryEntry(
  history: readonly HistoryEntry[],
  daily: Record<string, DailyStat>,
  entry: HistoryEntry,
  limit: number = HISTORY_LIMIT,
): { history: HistoryEntry[]; daily: Record<string, DailyStat> } {
  const nextDaily = { ...daily }
  const adjust = (dateKey: string, answeredDelta: number, correctDelta: number) => {
    const current = nextDaily[dateKey] ?? { date: dateKey, answered: 0, correct: 0 }
    const answered = Math.max(0, current.answered + answeredDelta)
    const correct = Math.max(0, current.correct + correctDelta)
    if (answered === 0 && correct === 0) {
      delete nextDaily[dateKey]
    } else {
      nextDaily[dateKey] = { date: dateKey, answered, correct }
    }
  }

  const previous = history.find((item) => item.id === entry.id)
  if (previous) {
    adjust(previous.dateKey, -previous.answered, -previous.correct)
  }
  adjust(entry.dateKey, entry.answered, entry.correct)

  return {
    history: [entry, ...history.filter((item) => item.id !== entry.id)]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, limit),
    daily: nextDaily,
  }
}
