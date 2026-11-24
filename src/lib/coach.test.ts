import { describe, expect, it } from 'vitest'
import { buildCoachReport } from './coach'
import { collections, domains } from '../data/taxonomy'
import { getLibraryCollections } from './library'
import { dateKey } from './datetime'

describe('buildCoachReport', () => {
  it('suggests a first practice when there is no history', () => {
    const report = buildCoachReport({ history: [], wrongBook: {}, daily: {} })
    expect(report.tips[0].id).toBe('steady')
    expect(report.tips[0].to).toBe('/catalog')
  })

  it('puts due wrong questions before new practice', () => {
    const now = Date.now()
    const report = buildCoachReport({
      history: [],
      wrongBook: {
        q1: {
          questionId: 'q1',
          collectionId: collections[0].id,
          wrongCount: 2,
          lastWrongAt: now - 86_400_000,
          lastSelection: [0],
        },
      },
      daily: { [dateKey(now)]: { date: dateKey(now), answered: 20, correct: 16 } },
      now,
    })
    expect(report.tips.some((tip) => tip.id === 'review-due')).toBe(true)
    expect(report.headline).toContain('错题')
  })

  it('points at the weakest domain when accuracy is low', () => {
    const library = getLibraryCollections()
    const weakCollection = library.find((item) => item.domainId === domains[0].id) ?? library[0]
    const report = buildCoachReport({
      history: [
        {
          id: 'h1',
          mode: 'practice',
          collectionId: weakCollection.id,
          collectionTitle: weakCollection.title,
          answered: 10,
          correct: 2,
          wrong: 8,
          skipped: 0,
          total: 10,
          accuracy: 20,
          durationSec: 300,
          finishedAt: Date.now(),
          dateKey: '2026-11-24',
        },
      ],
      wrongBook: {},
      daily: {},
    })
    expect(report.tips.some((tip) => tip.id === 'weak-domain')).toBe(true)
  })
})
