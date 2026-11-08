import { describe, expect, it } from 'vitest'
import { questionBank, getCollection, getQuestion, totalQuestions } from '../data'
import { collections, domains } from '../data/taxonomy'
import {
  createSession,
  formatDuration,
  isCorrect,
  lastNDays,
  normalizeSelection,
  streakFromDates,
  summarizeSession,
} from './quiz'
import { searchCatalog } from './search'
import type { Question } from '../data/types'

describe('question bank integrity', () => {
  it('has seven domains and 32 collections', () => {
    expect(domains).toHaveLength(7)
    expect(collections).toHaveLength(32)
  })

  it('maps every collection to a domain, track and unique id', () => {
    const ids = new Set(collections.map((item) => item.id))
    expect(ids.size).toBe(collections.length)
    for (const collection of collections) {
      expect(domains.some((domain) => domain.id === collection.domainId)).toBe(true)
      expect(collection.trackId.length > 0, collection.id).toBe(true)
    }
  })

  it('has questions for every collection with valid answer indexes', () => {
    expect(totalQuestions).toBeGreaterThanOrEqual(190)
    for (const collection of questionBank) {
      expect(collection.questions.length, collection.id).toBeGreaterThanOrEqual(6)
      for (const question of collection.questions) {
        expect(question.options.length, question.id).toBeGreaterThanOrEqual(2)
        expect(question.answer.length, question.id).toBeGreaterThan(0)
        for (const index of question.answer) {
          expect(Number.isInteger(index), question.id).toBe(true)
          expect(index, question.id).toBeGreaterThanOrEqual(0)
          expect(index, question.id).toBeLessThan(question.options.length)
        }
        if (question.type !== 'multiple') {
          expect(question.answer, question.id).toHaveLength(1)
        }
        expect(question.explanation.length, question.id).toBeGreaterThan(10)
      }
    }
  })

  it('has unique question ids across the bank', () => {
    const ids = questionBank.flatMap((collection) => collection.questions.map((q) => q.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves helpers by id', () => {
    const collection = getCollection('js-basics')
    expect(collection).toBeDefined()
    const question = collection!.questions[0]
    expect(getQuestion(question.id)).toEqual(question)
  })
})

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    collectionId: 'demo',
    type: 'single',
    stem: 'demo',
    options: ['a', 'b', 'c', 'd'],
    answer: [1],
    explanation: 'demo explanation text',
    difficulty: 1,
    tags: [],
    ...overrides,
  }
}

describe('answer evaluation', () => {
  it('accepts a correct single choice', () => {
    expect(isCorrect(question(), [1])).toBe(true)
  })

  it('rejects a wrong single choice', () => {
    expect(isCorrect(question(), [0])).toBe(false)
  })

  it('treats an incomplete multiple choice as incorrect', () => {
    const multiple = question({ type: 'multiple', answer: [0, 2] })
    expect(isCorrect(multiple, [0])).toBe(false)
    expect(isCorrect(multiple, [0, 2])).toBe(true)
    expect(isCorrect(multiple, [2, 0])).toBe(true)
    expect(isCorrect(multiple, [0, 2, 3])).toBe(false)
  })
})

describe('session scoring', () => {
  it('reports score, accuracy and skipped count', () => {
    const questions = [
      question({ id: 'a' }),
      question({ id: 'b' }),
      question({ id: 'c' }),
      question({ id: 'd' }),
      question({ id: 'e' }),
    ]
    const session = createSession({
      mode: 'practice',
      collectionId: 'demo',
      questionIds: questions.map((q) => q.id),
      now: 0,
    })
    session.answers = { a: [1], b: [1], c: [1], d: [1] }
    session.finishedAt = 30_000
    const summary = summarizeSession(session, questions, 30_000)
    expect(summary.correct).toBe(4)
    expect(summary.wrong).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(summary.accuracy).toBe(100)
    expect(summary.durationSec).toBe(30)
  })

  it('counts wrong answers and produces accuracy over answered questions', () => {
    const questions = [question({ id: 'a' }), question({ id: 'b' })]
    const session = createSession({
      mode: 'exam',
      collectionId: 'demo',
      questionIds: ['a', 'b'],
      now: 0,
    })
    session.answers = { a: [1], b: [0] }
    session.finishedAt = 60_000
    const summary = summarizeSession(session, questions, 60_000)
    expect(summary.correct).toBe(1)
    expect(summary.wrong).toBe(1)
    expect(summary.accuracy).toBe(50)
  })
})

describe('utility helpers', () => {
  it('normalizes selections', () => {
    expect(normalizeSelection([2, 0, 2])).toEqual([0, 2])
  })

  it('formats durations', () => {
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('computes streaks across days', () => {
    const now = new Date('2026-10-28T12:00:00Z').getTime()
    const days = lastNDays(3, now)
    expect(streakFromDates(days, now)).toBe(3)
    expect(streakFromDates([days[2]], now)).toBe(1)
    expect(streakFromDates([], now)).toBe(0)
  })
})

describe('catalog search', () => {
  it('finds collections by title and tags', () => {
    expect(searchCatalog('javascript').collections[0]?.id).toBe('js-basics')
    expect(searchCatalog('高数').collections[0]?.id).toBe('calculus')
    expect(searchCatalog('线性代数').collections[0]?.id).toBe('linear-algebra')
  })

  it('finds questions by stem content', () => {
    const result = searchCatalog('typeof null')
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.questions[0].stem).toContain('typeof null')
  })

  it('returns empty results for blank queries', () => {
    expect(searchCatalog('   ')).toEqual({ collections: [], questions: [] })
  })
})

describe('裸内容构建开关', () => {
  it('默认构建（未设置 VITE_BARE_CONTENT）保留示例题库', async () => {
    const mod = await import('../data')
    expect(mod.isBareContentBuild).toBe(false)
    expect(mod.questionBank.length).toBeGreaterThan(0)
    expect(mod.totalQuestions).toBeGreaterThan(0)
  })
})
