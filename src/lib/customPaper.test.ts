import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  availableQuestionCount,
  buildCustomPaper,
  clampCount,
  clampDuration,
} from './customPaper'
import { useAppStore } from '../store/useAppStore'
import type { QuestionSeed } from '../data/types'

function seed(count: number, prefix: string): QuestionSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'single' as const,
    stem: `${prefix} 第 ${index + 1} 题`,
    options: ['甲', '乙', '丙', '丁'],
    answer: [index % 4],
    explanation: `${prefix} 第 ${index + 1} 题解析内容。`,
    difficulty: 2,
    tags: [prefix],
  }))
}

beforeAll(() => {
  // 这两个用例只测组卷纯逻辑，不关心落库。addBank 在无 repo 时会 reject，
  // 必须吞掉，否则 Vitest 会把未处理的 rejection 记成错误。
  void useAppStore.getState().addBank({
    id: 'paper-a',
    title: '组卷甲库',
    subtitle: '测试',
    description: '',
    exam: '测试',
    icon: 'book',
    accent: '#315B7D',
    level: '入门',
    durationMin: 10,
    tags: [],
    importedAt: 1,
    questions: seed(12, '甲库'),
  }).catch(() => {})
  void useAppStore.getState().addBank({
    id: 'paper-b',
    title: '组卷乙库',
    subtitle: '测试',
    description: '',
    exam: '测试',
    icon: 'book',
    accent: '#9A3B32',
    level: '入门',
    durationMin: 10,
    tags: [],
    importedAt: 2,
    questions: seed(8, '乙库'),
  }).catch(() => {})
})

afterAll(() => {
  useAppStore.getState().removeBank('paper-a')
  useAppStore.getState().removeBank('paper-b')
})

describe('clamp helpers', () => {
  it('clamps count into 1..200', () => {
    expect(clampCount(0)).toBe(1)
    expect(clampCount(50)).toBe(50)
    expect(clampCount(500)).toBe(200)
    expect(clampCount(Number.NaN)).toBe(10)
  })

  it('clamps duration into 5..180', () => {
    expect(clampDuration(1)).toBe(5)
    expect(clampDuration(60)).toBe(60)
    expect(clampDuration(999)).toBe(180)
  })
})

describe('availableQuestionCount', () => {
  it('sums questions of selected banks', () => {
    expect(availableQuestionCount(['paper-a', 'paper-b'])).toBe(20)
    expect(availableQuestionCount(['paper-a'])).toBe(12)
    expect(availableQuestionCount([])).toBe(0)
    expect(availableQuestionCount(['missing'])).toBe(0)
  })
})

describe('buildCustomPaper', () => {
  it('rejects empty selection', () => {
    const paper = buildCustomPaper({ collectionIds: [], count: 10, durationMin: 15, order: 'random' })
    expect(paper.questions).toHaveLength(0)
    expect(paper.warning).toContain('至少选择一个题库')
  })

  it('takes questions in sequence order', () => {
    const paper = buildCustomPaper({ collectionIds: ['paper-a'], count: 5, durationMin: 15, order: 'sequence' }, () => 0.5)
    expect(paper.questions).toHaveLength(5)
    expect(paper.questions[0].stem).toContain('第 1 题')
    expect(paper.warning).toBe('')
    expect(paper.title).toContain('组卷甲库')
  })

  it('shuffles without duplicates', () => {
    const paper = buildCustomPaper({ collectionIds: ['paper-a', 'paper-b'], count: 15, durationMin: 30, order: 'random' }, () => 0.3)
    const ids = paper.questions.map((question) => question.id)
    expect(new Set(ids).size).toBe(15)
  })

  it('caps at pool size with a warning when requested too many', () => {
    const paper = buildCustomPaper({ collectionIds: ['paper-b'], count: 100, durationMin: 60, order: 'random' }, () => 0.3)
    expect(paper.questions).toHaveLength(8)
    expect(paper.spec.count).toBe(8)
    expect(paper.warning).toContain('不足 100 题')
    expect(paper.warning).toContain('8 题')
  })

  it('cross-bank paper uses a combined title', () => {
    const paper = buildCustomPaper({ collectionIds: ['paper-a', 'paper-b'], count: 10, durationMin: 30, order: 'random' })
    expect(paper.title).toContain('2 个题库')
  })
})
