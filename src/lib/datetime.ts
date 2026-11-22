import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

/**
 * 全项目唯一的日期入口。
 *
 * 以前 `quiz.ts` 里散着手写的 `new Date()` 拼接、相对时间与连续天数计算，
 * 跨月/跨年/时区都要自己兜。这里统一交给 dayjs，业务代码只处理字符串。
 */
dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export default dayjs

export function dateKey(timestamp: number = Date.now()): string {
  return dayjs(timestamp).format('YYYY-MM-DD')
}

export function dateStamp(timestamp: number = Date.now()): string {
  return dayjs(timestamp).format('YYYYMMDD')
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  return dayjs(timestamp).from(dayjs(now))
}

export function lastNDays(count: number, now: number = Date.now()): string[] {
  const base = dayjs(now).startOf('day')
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i -= 1) keys.push(base.subtract(i, 'day').format('YYYY-MM-DD'))
  return keys
}

export function streakFromDates(dates: string[], now: number = Date.now()): number {
  if (dates.length === 0) return 0
  const unique = [...new Set(dates)].sort((a, b) => b.localeCompare(a))
  let streak = 0
  let cursor = dayjs(now).startOf('day')
  for (const value of unique) {
    const day = dayjs(value)
    if (!day.isValid()) continue
    if (day.isSame(cursor, 'day')) {
      streak += 1
      cursor = cursor.subtract(1, 'day')
      continue
    }
    if (streak === 0 && day.isSame(cursor.subtract(1, 'day'), 'day')) {
      streak = 1
      cursor = day.subtract(1, 'day')
      continue
    }
    break
  }
  return streak
}
