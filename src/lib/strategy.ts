import { collections, domains, tracksOfDomain } from '../data/taxonomy'
import type { Question } from '../data/types'
import type { WrongEntry } from '../store/useAppStore'
import { shuffle } from './quiz'
import { getLibraryCollections } from './library'

function allQuestionsIncludingImported(): Question[] {
  return getLibraryCollections().flatMap((collection) => collection.questions)
}

export type StrategyKind = 'daily' | 'weak' | 'random' | 'wrong'

export interface StrategyMeta {
  kind: StrategyKind
  title: string
  subtitle: string
  description: string
  action: string
  tone: 'accent' | 'moss' | 'gold' | 'danger'
}

export interface StrategyPlan {
  kind: StrategyKind
  title: string
  description: string
  questions: Question[]
  reason: string
}

export const strategyCatalog: StrategyMeta[] = [
  {
    kind: 'daily',
    title: '每日一练',
    subtitle: '10 题 · 跨领域',
    description: '按各领域正确率加权配题：越薄弱的领域分到越多题，每天一组固定题量。',
    action: '开始今日练习',
    tone: 'accent',
  },
  {
    kind: 'weak',
    title: '薄弱项突破',
    subtitle: '按正确率排序',
    description: '从正确率最低的领域抽题，集中攻破最拖分的部分。',
    action: '查看薄弱项',
    tone: 'danger',
  },
  {
    kind: 'random',
    title: '随机组卷',
    subtitle: '12 题 · 全库',
    description: '全题库随机抽题，用来检验真实水平，避免只刷熟题。',
    action: '随机开考',
    tone: 'moss',
  },
  {
    kind: 'wrong',
    title: '错题复习',
    subtitle: '仅错题本',
    description: '把错题重新做一遍，答对即移出错题本，适合考前回看。',
    action: '复习错题',
    tone: 'gold',
  },
]

const DAILY_SIZE = 10

export function collectAllQuestions(): Question[] {
  return allQuestionsIncludingImported()
}

export function domainAccuracy(
  history: Array<{ collectionId: string; answered: number; correct: number }>,
): Array<{ domainId: string; name: string; answered: number; correct: number; accuracy: number }> {
  const bucket = new Map<string, { answered: number; correct: number }>()
  let importedAnswered = 0
  let importedCorrect = 0
  for (const entry of history) {
    const collection = collections.find((item) => item.id === entry.collectionId)
    if (!collection) {
      if (entry.collectionId.startsWith('plan:') || entry.collectionId.includes('-')) {
        importedAnswered += entry.answered
        importedCorrect += entry.correct
      }
      continue
    }
    const current = bucket.get(collection.domainId) ?? { answered: 0, correct: 0 }
    bucket.set(collection.domainId, {
      answered: current.answered + entry.answered,
      correct: current.correct + entry.correct,
    })
  }
  if (importedAnswered > 0) {
    bucket.set('imported', { answered: importedAnswered, correct: importedCorrect })
  }
  const importedStats = bucket.get('imported')
  const importedPart = importedStats && importedStats.answered > 0
    ? [{
        domainId: 'imported' as const,
        name: '我的题库',
        answered: importedStats.answered,
        correct: importedStats.correct,
        accuracy: Math.round((importedStats.correct / importedStats.answered) * 100),
      }]
    : []
  return [
    ...domains
      .map((domain) => {
        const stats = bucket.get(domain.id) ?? { answered: 0, correct: 0 }
        return {
          domainId: domain.id,
          name: domain.name,
          answered: stats.answered,
          correct: stats.correct,
          accuracy: stats.answered === 0 ? -1 : Math.round((stats.correct / stats.answered) * 100),
        }
      })
      .filter((item) => item.answered > 0),
    ...importedPart,
  ].sort((a, b) => a.accuracy - b.accuracy)
}

function pickByDomain(counts: Record<string, number>, random: () => number, size: number): Question[] {
  const picked: Question[] = []
  const seen = new Set<string>()
  const domainOrder = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 5)
  const totalWeight = domainOrder.reduce((sum, id) => sum + counts[id], 0)

  for (const domainId of domainOrder) {
    if (picked.length >= size) break
    const quota = Math.max(1, Math.round((counts[domainId] / Math.max(1, totalWeight)) * size))
    const pools = shuffle(
      getLibraryCollections().filter((collection) => collection.domainId === domainId),
      random,
    ).map((collection) => ({
      questions: shuffle(collection.questions, random),
      used: 0,
    }))
    let taken = 0
    for (const pool of pools) {
      if (taken >= quota || picked.length >= size) break
      for (const question of pool.questions) {
        if (taken >= quota || picked.length >= size || pool.used >= 2) break
        if (seen.has(question.id)) continue
        seen.add(question.id)
        picked.push(question)
        pool.used += 1
        taken += 1
      }
    }
  }

  if (picked.length < size) {
    for (const question of shuffle(collectAllQuestions(), random)) {
      if (picked.length >= size) break
      if (seen.has(question.id)) continue
      seen.add(question.id)
      picked.push(question)
    }
  }
  return picked.slice(0, size)
}

export function buildDailyPlan(options: {
  history: Array<{ collectionId: string; answered: number; correct: number }>
  recentQuestionIds?: string[]
  size?: number
  random?: () => number
}): StrategyPlan {
  const size = options.size ?? DAILY_SIZE
  const random = options.random ?? Math.random
  const weak = domainAccuracy(options.history)
  const counts: Record<string, number> = {}

  if (weak.length > 0) {
    const bottom = weak.slice(0, Math.min(3, weak.length))
    for (const item of bottom) {
      counts[item.domainId] = Math.max(1, 4 - Math.floor(item.accuracy / 40))
    }
  }
  const allDomainIds = domains.map((domain) => domain.id)
  for (const domainId of allDomainIds) {
    if (!counts[domainId]) counts[domainId] = 1
  }
  const recent = new Set(options.recentQuestionIds ?? [])
  const picked = pickByDomain(counts, random, size).filter((question) => !recent.has(question.id))
  const filled = picked.length >= size ? picked : pickByDomain(counts, random, size)

  return {
    kind: 'daily',
    title: '今日一练',
    description: `按薄弱领域加权抽取 ${size} 题，覆盖多个题库。`,
    questions: filled,
    reason: weak.length > 0 ? `近期正确率最低：${weak[0].name} ${weak[0].accuracy}%` : '尚无历史数据，按全领域均衡配题',
  }
}

export function buildWeaknessPlan(options: {
  history: Array<{ collectionId: string; answered: number; correct: number }>
  size?: number
  random?: () => number
}): StrategyPlan {
  const size = options.size ?? 10
  const random = options.random ?? Math.random
  const weak = domainAccuracy(options.history)
  if (weak.length === 0) {
    return {
      kind: 'weak',
      title: '薄弱项突破',
      description: '先完成一次练习，系统才能判断你的薄弱领域。',
      questions: [],
      reason: '暂无足够数据',
    }
  }
  const target = weak.slice(0, 2).map((item) => item.domainId)
  const pool = getLibraryCollections()
    .filter((collection) => target.includes(collection.domainId))
    .flatMap((collection) => collection.questions)
  return {
    kind: 'weak',
    title: '薄弱项突破',
    description: `从 ${weak.slice(0, 2).map((item) => item.name).join('、')} 抽题，集中补齐短板。`,
    questions: shuffle(pool, random).slice(0, size),
    reason: `当前最弱：${weak.map((item) => `${item.name} ${item.accuracy}%`).slice(0, 2).join('、')}`,
  }
}

export function buildRandomPlan(options: { size?: number; random?: () => number } = {}): StrategyPlan {
  const size = options.size ?? 12
  const random = options.random ?? Math.random
  return {
    kind: 'random',
    title: '随机组卷',
    description: `从全库 ${collectAllQuestions().length} 题中随机抽 ${size} 题，模拟陌生题感。`,
    questions: shuffle(collectAllQuestions(), random).slice(0, size),
    reason: '全库随机，不偏向任何领域',
  }
}

export function buildWrongPlan(options: {
  wrongBook: Record<string, WrongEntry>
  size?: number
}): StrategyPlan {
  const size = options.size ?? 20
  const entries = Object.values(options.wrongBook).sort((a, b) => b.wrongCount - a.wrongCount)
  const idSet = new Set(entries.map((entry) => entry.questionId))
  const questions = collectAllQuestions().filter((question) => idSet.has(question.id)).slice(0, size)
  return {
    kind: 'wrong',
    title: '错题复习',
    description:
      questions.length === 0
        ? '错题本是空的，先去练习几组题吧。'
        : `按错误次数排序，取前 ${questions.length} 道错题重做。`,
    questions,
    reason: questions.length === 0 ? '错题本为空' : `共 ${entries.length} 道错题待复习`,
  }
}

export function buildPlan(
  kind: StrategyKind,
  options: {
    history: Array<{ collectionId: string; answered: number; correct: number }>
    wrongBook: Record<string, WrongEntry>
    random?: () => number
  },
): StrategyPlan {
  switch (kind) {
    case 'daily':
      return buildDailyPlan({ history: options.history, random: options.random })
    case 'weak':
      return buildWeaknessPlan({ history: options.history, random: options.random })
    case 'random':
      return buildRandomPlan({ random: options.random })
    case 'wrong':
      return buildWrongPlan({ wrongBook: options.wrongBook })
  }
}

export function trackNameOf(collectionId: string): string {
  const collection = collections.find((item) => item.id === collectionId)
  if (!collection) return ''
  const track = tracksOfDomain(collection.domainId).find((item) => item.id === collection.trackId)
  return track?.name ?? ''
}
