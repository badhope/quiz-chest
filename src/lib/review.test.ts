import { describe, expect, it } from 'vitest'
import { dueForecast, ERROR_REASON_LABELS } from './review'

describe('dueForecast', () => {
  const now = new Date(2026, 10, 25, 12, 0, 0).getTime()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 10, 25 + index, 9, 0, 0)
    return date.getTime()
  })

  it('buckets overdue cards into today and ignores cards beyond the window', () => {
    const forecast = dueForecast(
      [
        { fsrs: { due: 0 } },
        { fsrs: { due: now - 3 * 86_400_000 } },
        { fsrs: { due: days[1] } },
        { fsrs: { due: days[6] } },
        { fsrs: { due: days[7] } },
      ],
      7,
      now,
    )
    expect(forecast).toHaveLength(7)
    expect(forecast[0]).toMatchObject({ label: '今天', count: 3, overdue: true })
    expect(forecast[1]).toMatchObject({ label: '明天', count: 1 })
    expect(forecast[6].count).toBe(1)
  })

  it('keeps an empty day at zero instead of filling it with overdue cards', () => {
    const forecast = dueForecast([], 7, now)
    expect(forecast.every((day) => day.count === 0)).toBe(true)
    expect(forecast[0].dateKey).toBe('11/25')
  })
})

describe('ERROR_REASON_LABELS', () => {
  it('names four actionable reasons without blaming the user', () => {
    expect(Object.keys(ERROR_REASON_LABELS)).toEqual(['concept', 'method', 'careless', 'time'])
    expect(ERROR_REASON_LABELS.concept).toBe('概念没懂')
  })
})
