import { describe, expect, it } from 'vitest'
import {
  buildDailyPlan,
  buildPlan,
  buildRandomPlan,
  buildWeaknessPlan,
  buildWrongPlan,
  domainAccuracy,
  strategyCatalog,
  trackNameOf,
} from './strategy'
import { questionBank } from '../data'
import { collections, domains, tracks, tracksOfDomain } from '../data/taxonomy'

function seeded(seed: number): () => number {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

describe('track taxonomy', () => {
  it('assigns every collection to an existing track of its own domain', () => {
    for (const collection of collections) {
      const track = tracks.find((item) => item.id === collection.trackId)
      expect(track, collection.id).toBeDefined()
      expect(track!.domainId, collection.id).toBe(collection.domainId)
    }
  })

  it('gives every domain at least one track', () => {
    for (const domain of domains) {
      expect(tracksOfDomain(domain.id).length, domain.id).toBeGreaterThan(0)
    }
  })

  it('resolves a readable track name for a collection', () => {
    expect(trackNameOf('calculus')).toBe('数学公共课')
    expect(trackNameOf('js-basics')).toBe('前端开发')
  })
})

describe('strategy catalog', () => {
  it('exposes four strategy kinds', () => {
    expect(strategyCatalog.map((item) => item.kind).sort()).toEqual([
      'daily',
      'random',
      'weak',
      'wrong',
    ])
  })
})

describe('daily plan', () => {
  it('builds a stable size and unique questions', () => {
    const plan = buildDailyPlan({ history: [], random: seeded(7) })
    expect(plan.questions).toHaveLength(10)
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(10)
    expect(plan.reason).toContain('均衡')
  })

  it('weights toward weaker domains when history exists', () => {
    const history = [
      { collectionId: 'js-basics', answered: 10, correct: 9 },
      { collectionId: 'calculus', answered: 10, correct: 2 },
    ]
    const weak = domainAccuracy(history)
    expect(weak[0].domainId).toBe('university')
    const plan = buildDailyPlan({ history, random: seeded(3) })
    const universityCount = plan.questions.filter((question) => {
      const collection = questionBank.find((item) => item.id === question.collectionId)
      return collection?.domainId === 'university'
    }).length
    expect(universityCount).toBeGreaterThanOrEqual(2)
  })

  it('never repeats question ids', () => {
    const plan = buildDailyPlan({
      history: [{ collectionId: 'calculus', answered: 4, correct: 1 }],
      random: seeded(11),
    })
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(plan.questions.length)
  })
})

describe('weakness plan', () => {
  it('returns an empty plan without history', () => {
    const plan = buildWeaknessPlan({ history: [] })
    expect(plan.questions).toHaveLength(0)
  })

  it('draws from the weakest domains', () => {
    const history = [
      { collectionId: 'js-basics', answered: 5, correct: 4 },
      { collectionId: 'verbal', answered: 5, correct: 1 },
    ]
    const plan = buildWeaknessPlan({ history, random: seeded(5) })
    const domainIds = new Set(
      plan.questions.map(
        (question) =>
          questionBank.find((item) => item.id === question.collectionId)?.domainId,
      ),
    )
    expect(domainIds.has('public')).toBe(true)
  })
})

describe('random plan', () => {
  it('returns the requested size', () => {
    const plan = buildRandomPlan({ size: 12, random: seeded(2) })
    expect(plan.questions).toHaveLength(12)
  })
})

describe('wrong plan', () => {
  it('maps wrong book entries to questions by mistake count', () => {
    const plan = buildWrongPlan({
      wrongBook: {
        'js-basics-1': {
          questionId: 'js-basics-1',
          collectionId: 'js-basics',
          wrongCount: 3,
          lastWrongAt: 1,
          lastSelection: [0],
        },
        'js-basics-2': {
          questionId: 'js-basics-2',
          collectionId: 'js-basics',
          wrongCount: 1,
          lastWrongAt: 2,
          lastSelection: [1],
        },
      },
    })
    expect(plan.questions).toHaveLength(2)
    expect(plan.questions[0].id).toBe('js-basics-1')
  })

  it('handles an empty wrong book', () => {
    expect(buildWrongPlan({ wrongBook: {} }).questions).toHaveLength(0)
  })
})

describe('buildPlan dispatch', () => {
  it('routes each kind to a plan', () => {
    const base = { history: [], wrongBook: {} }
    expect(buildPlan('daily', { ...base, random: seeded(1) }).kind).toBe('daily')
    expect(buildPlan('weak', base).kind).toBe('weak')
    expect(buildPlan('random', { ...base, random: seeded(1) }).kind).toBe('random')
    expect(buildPlan('wrong', base).kind).toBe('wrong')
  })
})
