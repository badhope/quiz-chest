import { collections, domains, tracksOfDomain } from '../data/taxonomy'
import type { Question } from '../data/types'
import type { WrongEntry } from '../store/useAppStore'
import { shuffle } from './quiz'
import { compareByDue } from './review'
import { getLibraryCollections, type LibraryCollection } from './library'

// 一次计划只取一次题库快照。首页每日一练原先按领域反复遍历全库，
// 题量上来后明显拖慢；现在先 flatMap 一次，后续都在数组上做。
function questionsOf(library: LibraryCollection[]): Question[] {
  return library.flatMap((collection) => collection.questions)
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

export function collectAllQuestions(library: LibraryCollection[] = getLibraryCollections()): Question[] {
  return questionsOf(library)
}

export function domainAccuracy(
  history: Array<{ collectionId: string; answered: number; correct: number }>,
  library: LibraryCollection[] = getLibraryCollections(),
): Array<{ domainId: string; name: string; answered: number; correct: number; accuracy: number }> {
  const byCollection = new Map(library.map((collection) => [collection.id, collection]))
  const names = new Map<string, string>(domains.map((domain) => [domain.id, domain.name]))
  names.set('imported', '我的题库')
  const bucket = new Map<string, { answered: number; correct: number }>()

  for (const entry of history) {
    // plan:/compose: 是临时练习容器，不对应真实题库，直接跳过；
    // 以前按 '-' 猜归属，会把策略练习和自组卷算进「我的题库」。
    const collection = byCollection.get(entry.collectionId)
    if (!collection) continue
    const current = bucket.get(collection.domainId) ?? { answered: 0, correct: 0 }
    bucket.set(collection.domainId, {
      answered: current.answered + entry.answered,
      correct: current.correct + entry.correct,
    })
  }

  return [...bucket.entries()]
    .filter(([, stats]) => stats.answered > 0)
    .map(([domainId, stats]) => ({
      domainId,
      name: names.get(domainId) ?? domainId,
      answered: stats.answered,
      correct: stats.correct,
      accuracy: Math.round((stats.correct / stats.answered) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
}

function pickByDomain(
  counts: Record<string, number>,
  random: () => number,
  size: number,
  library: LibraryCollection[],
  allQuestions: Question[],
  exclude?: Set<string>,
): Question[] {
  const picked: Question[] = []
  const seen = new Set(exclude ?? [])
  const domainOrder = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 5)
  const totalWeight = domainOrder.reduce((sum, id) => sum + counts[id], 0)
  const byDomain = new Map<string, LibraryCollection[]>()
  for (const collection of library) {
    const list = byDomain.get(collection.domainId)
    if (list) list.push(collection)
    else byDomain.set(collection.domainId, [collection])
  }

  for (const domainId of domainOrder) {
    if (picked.length >= size) break
    const quota = Math.max(1, Math.round((counts[domainId] / Math.max(1, totalWeight)) * size))
    const pools = shuffle(
      byDomain.get(domainId) ?? [],
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
    for (const question of shuffle(allQuestions, random)) {
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
  const library = getLibraryCollections()
  const allQuestions = questionsOf(library)
  const weak = domainAccuracy(options.history, library)
  const counts: Record<string, number> = {}

  if (weak.length > 0) {
    const bottom = weak.slice(0, Math.min(3, weak.length))
    for (const item of bottom) {
      counts[item.domainId] = Math.max(1, 4 - Math.floor(item.accuracy / 40))
    }
  }
  // 内置领域 + 导入题库实际用到的领域，都参与每日一练的权重。
  const allDomainIds = new Set([
    ...domains.map((domain) => domain.id),
    ...library.map((collection) => collection.domainId),
  ])
  for (const domainId of allDomainIds) {
    if (!counts[domainId]) counts[domainId] = 1
  }
  const recent = new Set(options.recentQuestionIds ?? [])
  const picked = pickByDomain(counts, random, size, library, allQuestions, recent)
  // 最近做过的题先避开；题库不够时再回填，但不要和已选题重复。
  const filled =
    picked.length >= size
      ? picked
      : [
          ...picked,
          ...pickByDomain(
            counts,
            random,
            size - picked.length,
            library,
            allQuestions,
            new Set(picked.map((question) => question.id)),
          ),
        ].slice(0, size)

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
  const library = getLibraryCollections()
  const weak = domainAccuracy(options.history, library)
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
  const pool = library
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
  const allQuestions = collectAllQuestions()
  return {
    kind: 'random',
    title: '随机组卷',
    description: `从全库 ${allQuestions.length} 题中随机抽 ${size} 题，模拟陌生题感。`,
    questions: shuffle(allQuestions, random).slice(0, size),
    reason: '全库随机，不偏向任何领域',
  }
}

export function buildWrongPlan(options: {
  wrongBook: Record<string, WrongEntry>
  size?: number
}): StrategyPlan {
  const size = options.size ?? 20
  const entries = Object.values(options.wrongBook).sort((a, b) => compareByDue(a, b))
  const idSet = new Set(entries.map((entry) => entry.questionId))
  const allQuestions = collectAllQuestions()
  const questions = allQuestions.filter((question) => idSet.has(question.id)).slice(0, size)
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
  const library = getLibraryCollections().find((item) => item.id === collectionId)
  // 只有导入时显式写了分组名才覆盖；内置题库的 subtitle 是题库简介，不是轨道。
  if (library?.trackName) return library.trackName
  const collection = collections.find((item) => item.id === collectionId)
  if (!collection) return ''
  const track = tracksOfDomain(collection.domainId).find((item) => item.id === collection.trackId)
  return track?.name ?? ''
}
