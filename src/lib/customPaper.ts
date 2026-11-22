import type { Question } from '../data/types'
import { getLibraryCollections } from './library'
import { shuffle } from './quiz'

export interface CustomPaperSpec {
  collectionIds: string[]
  count: number
  durationMin: number
  order: 'random' | 'sequence'
}

export interface CustomPaper {
  spec: CustomPaperSpec
  questions: Question[]
  title: string
  warning: string
}

export const COUNT_PRESETS = [10, 20, 30, 50, 100] as const
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const

export const COUNT_MIN = 1
export const COUNT_MAX = 200
export const DURATION_MIN = 5
export const DURATION_MAX = 180

export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return COUNT_PRESETS[0]
  return Math.min(COUNT_MAX, Math.max(COUNT_MIN, Math.round(value)))
}

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return DURATION_PRESETS[0]
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(value)))
}

export function availableQuestionCount(collectionIds: string[]): number {
  if (collectionIds.length === 0) return 0
  const library = getLibraryCollections()
  const idSet = new Set(collectionIds)
  return library
    .filter((collection) => idSet.has(collection.id))
    .reduce((sum, collection) => sum + collection.questions.length, 0)
}

export function buildCustomPaper(spec: CustomPaperSpec, random: () => number = Math.random): CustomPaper {
  const library = getLibraryCollections()
  const idSet = new Set(spec.collectionIds)
  const selected = library.filter((collection) => idSet.has(collection.id))

  if (selected.length === 0) {
    return {
      spec,
      questions: [],
      title: '自定义组卷',
      warning: '请至少选择一个题库',
    }
  }

  const pool = selected.flatMap((collection) => collection.questions)
  const title = selected.length === 1
    ? `${selected[0].title} · 自定义卷`
    : `跨库组卷 · ${selected.length} 个题库`

  if (pool.length === 0) {
    return { spec, questions: [], title, warning: '所选题库暂无题目' }
  }

  const requested = clampCount(spec.count)
  if (requested > pool.length) {
    const questions = spec.order === 'sequence' ? pool : shuffle(pool, random)
    return {
      spec: { ...spec, count: questions.length },
      questions,
      title,
      warning: `所选题库共 ${pool.length} 题，不足 ${requested} 题，已按全部 ${questions.length} 题组卷`,
    }
  }

  const questions = spec.order === 'sequence' ? pool.slice(0, requested) : shuffle(pool, random).slice(0, requested)
  return { spec: { ...spec, count: questions.length }, questions, title, warning: '' }
}

export function suggestedDuration(questionCount: number): number {
  return clampDuration(Math.max(DURATION_MIN, Math.round((questionCount * 60) / 60 / 1.2)))
}
