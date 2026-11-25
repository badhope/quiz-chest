import { describe, expect, it } from 'vitest'
import type { Question, QuestionType } from '../data/types'
import { EXAM_PASS_RATIO, EXAM_TYPE_POINTS, questionPoints, scoreExam } from './exam'

function makeQuestion(type: QuestionType, id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    collectionId: 'demo',
    type,
    stem: `题目 ${id}`,
    options: type === 'single' || type === 'multiple' ? ['A', 'B', 'C', 'D'] : [],
    answer: type === 'single' || type === 'multiple' || type === 'judge' ? [0] : [],
    answerText: type === 'fill' ? ['答案'] : type === 'short' ? ['参考答案'] : undefined,
    keywords: type === 'short' ? ['关键词'] : undefined,
    explanation: '解析文字足够长，避免被误判为空。',
    difficulty: 1,
    tags: ['测试'],
    ...overrides,
  }
}

describe('exam scoring', () => {
  it('weights each question type and sums the full score', () => {
    expect(EXAM_TYPE_POINTS.single).toBe(2)
    expect(questionPoints('multiple')).toBe(3)
    expect(EXAM_PASS_RATIO).toBe(0.6)
  })

  it('scores correct answers by type and leaves wrong or skipped at zero', () => {
    const questions = [
      makeQuestion('single', 's1'),
      makeQuestion('multiple', 'm1', { answer: [0, 1] }),
      makeQuestion('judge', 'j1'),
      makeQuestion('fill', 'f1'),
      makeQuestion('short', 'q1'),
    ]
    const result = scoreExam(
      questions,
      { s1: [0], m1: [0], j1: [0], f1: [] },
      { q1: '关键词' },
    )

    expect(result.fullScore).toBe(12)
    expect(result.score).toBe(7)
    expect(result.passScore).toBe(8)
    expect(result.passed).toBe(false)
    expect(result.types.map((item) => [item.type, item.score, item.fullScore])).toEqual([
      ['single', 2, 2],
      ['multiple', 0, 3],
      ['judge', 1, 1],
      ['fill', 0, 2],
      ['short', 4, 4],
    ])
  })

  it('marks a score at the pass line as passed', () => {
    const below = scoreExam([makeQuestion('single', 's1'), makeQuestion('single', 's2')], {
      s1: [0],
    })
    expect(below.fullScore).toBe(4)
    expect(below.passScore).toBe(3)
    expect(below.passed).toBe(false)

    const pass = scoreExam(
      [makeQuestion('single', 's1'), makeQuestion('single', 's2'), makeQuestion('single', 's3')],
      { s1: [0], s2: [0], s3: [1] },
    )
    expect(pass.fullScore).toBe(6)
    expect(pass.passScore).toBe(4)
    expect(pass.score).toBe(4)
    expect(pass.passed).toBe(true)
  })

  it('does not treat a blank text answer as correct', () => {
    const result = scoreExam([makeQuestion('fill', 'f1')], {}, { f1: '   ' })
    expect(result.score).toBe(0)
    expect(result.types[0].answered).toBe(0)
  })

  it('handles an empty set without dividing by zero', () => {
    const result = scoreExam([], {})
    expect(result.fullScore).toBe(0)
    expect(result.score).toBe(0)
    expect(result.passScore).toBe(0)
    expect(result.passed).toBe(false)
    expect(result.types).toEqual([])
  })
})
