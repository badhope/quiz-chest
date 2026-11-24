import { collections, domains } from '../data/taxonomy'
import { getLibraryCollections, type LibraryCollection } from './library'
import type { Question } from '../data/types'

export interface SearchResult {
  collections: LibraryCollection[]
  questions: Question[]
}

const aliases: Record<string, string[]> = {
  calculus: ['高数', '微积分', '高等数学'],
  'linear-algebra': ['线代', '线性代数'],
  probability: ['概率', '概统', '数理统计'],
  'gaokao-english': ['高考英语', '英语语法'],
  'middle-math': ['中考数学', '初中数学'],
  'primary-math': ['小学数学', '奥数'],
  'high-chinese': ['高中语文', '古诗文'],
  'gaokao-physics': ['高考物理', '物理'],
  cet4: ['四级', 'CET4', '大学英语'],
  'computer-organization': ['408', '计组', '计算机组成'],
  'teacher-cert': ['教资', '教师资格'],
  accounting: ['初级会计', '会计'],
  'construction-law': ['一建', '建造师'],
  pharmacist: ['药师', '执业药师'],
  'law-exam': ['法考', '民法'],
  'ielts-reading': ['雅思', 'IELTS'],
  'toefl-listening': ['托福', 'TOEFL'],
  japanese: ['日语', 'JLPT'],
  'business-english': ['商务英语', 'BEC'],
  'js-basics': ['javascript', 'js', '前端'],
  'ts-types': ['typescript', 'ts', '类型'],
  algorithms: ['算法', '数据结构', '面试'],
  sql: ['数据库', 'mysql', '查询'],
  network: ['计算机网络', 'http', 'tcp'],
  verbal: ['言语', '行测', '成语'],
  quantitative: ['数量', '行测', '数学运算'],
  essay: ['申论', '写作'],
  'public-base': ['公基', '事业单位', '公共基础'],
  'chinese-history': ['历史', '中国史'],
  'world-geography': ['地理', '世界地理'],
  'life-science': ['科学', '生活常识', '健康'],
  arts: ['文学艺术', '艺术', '文学'],
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function latinWords(value: string): string[] {
  return [...value.matchAll(/[a-z0-9]+/g)].map((match) => match[0])
}

function cjkRuns(value: string): string[] {
  return [...value.matchAll(/\p{Script=Han}+/gu)].map((match) => match[0])
}

function bigrams(value: string): string[] {
  if (value.length < 2) return []
  const result: string[] = []
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2))
  }
  return result
}

/**
 * 轻量倒排索引。原来每次按键都 `includes` 全表，题库过千后输入明显卡；
 * 现在中文按二元组、英文按词前缀建表，查询取交集，最后再用原文过滤一次。
 * 单字查询没有二元组可查，直接退回原表扫，输入很短时开销可以接受。
 */
class TextIndex<T> {
  private entries: { normalized: string; item: T }[] = []
  private postings = new Map<string, number[]>()
  private latinTokens = new Set<string>()
  private sortedTokens: string[] | null = null

  add(text: string, item: T): void {
    const normalized = normalize(text)
    const index = this.entries.length
    this.entries.push({ normalized, item })

    const tokens = new Set<string>()
    for (const word of latinWords(normalized)) {
      if (word.length >= 2) {
        tokens.add(word)
        if (!this.latinTokens.has(word)) {
          this.latinTokens.add(word)
          this.sortedTokens = null
        }
      }
    }
    for (const run of cjkRuns(normalized)) {
      for (const gram of bigrams(run)) tokens.add(gram)
    }
    for (const token of tokens) {
      const list = this.postings.get(token)
      if (list) list.push(index)
      else this.postings.set(token, [index])
    }
  }

  private prefixPostings(prefix: string): number[] | null {
    if (prefix.length < 2) {
      return this.entries
        .map((entry, index) => (entry.normalized.includes(prefix) ? index : -1))
        .filter((index) => index >= 0)
    }
    if (!this.sortedTokens) this.sortedTokens = [...this.latinTokens].sort()
    const tokens = this.sortedTokens
    let low = 0
    let high = tokens.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (tokens[middle] < prefix) low = middle + 1
      else high = middle
    }
    const result = new Set<number>()
    for (let index = low; index < tokens.length && tokens[index].startsWith(prefix); index += 1) {
      for (const entry of this.postings.get(tokens[index]) ?? []) result.add(entry)
    }
    if (result.size === 0) return null
    return [...result].sort((a, b) => a - b)
  }

  private intersect(lists: number[][]): number[] {
    if (lists.length === 0) return []
    const sorted = [...lists].sort((a, b) => a.length - b.length)
    let result = sorted[0]
    for (const list of sorted.slice(1)) {
      const next: number[] = []
      let left = 0
      let right = 0
      while (left < result.length && right < list.length) {
        if (result[left] === list[right]) {
          next.push(result[left])
          left += 1
          right += 1
        } else if (result[left] < list[right]) left += 1
        else right += 1
      }
      result = next
      if (result.length === 0) return []
    }
    return result
  }

  search(rawQuery: string): T[] {
    const normalized = normalize(rawQuery)
    if (!normalized) return []
    const words = latinWords(normalized)
    const runs = cjkRuns(normalized)
    const parts = [...words, ...runs]
    // 单字查询没有二元组可查，直接退回原文过滤；它只影响极短输入，
    // 不会成为大列表的主要开销。
    if (parts.length === 0 || parts.every((part) => part.length < 2)) {
      return this.entries
        .filter((entry) => entry.normalized.includes(normalized))
        .map((entry) => entry.item)
    }

    const lists: number[][] = []
    for (const word of words) {
      const list = this.prefixPostings(word)
      if (!list) return []
      lists.push(list)
    }
    for (const run of runs) {
      if (run.length < 2) {
        lists.push(
          this.entries
            .map((entry, index) => (entry.normalized.includes(run) ? index : -1))
            .filter((index) => index >= 0),
        )
        continue
      }
      for (const gram of bigrams(run)) {
        const list = this.postings.get(gram)
        if (!list) return []
        lists.push(list)
      }
    }

    const hits = this.intersect(lists)
    if (hits.length === 0) return []
    return hits
      .map((index) => this.entries[index])
      .filter((entry) => parts.every((part) => entry.normalized.includes(part)))
      .map((entry) => entry.item)
  }
}

function collectionHaystack(collection: LibraryCollection): string {
  const domainName = domains.find((domain) => domain.id === collection.domainId)?.name ?? ''
  return [
    collection.title,
    collection.subtitle,
    collection.description,
    collection.exam,
    domainName,
    ...collection.tags,
    ...(aliases[collection.id] ?? []),
  ].join(' ')
}

function questionHaystack(question: Question): string {
  return [question.stem, ...question.tags, ...question.options].join(' ')
}

const collectionIndexCache = new WeakMap<LibraryCollection[], TextIndex<LibraryCollection>>()
const questionIndexCache = new WeakMap<LibraryCollection[], TextIndex<{ question: Question }>>()

function buildCollectionIndex(library: LibraryCollection[]): TextIndex<LibraryCollection> {
  const cached = collectionIndexCache.get(library)
  if (cached) return cached
  const index = new TextIndex<LibraryCollection>()
  for (const collection of library) index.add(collectionHaystack(collection), collection)
  collectionIndexCache.set(library, index)
  return index
}

function buildQuestionIndex(library: LibraryCollection[]): TextIndex<{ question: Question }> {
  const cached = questionIndexCache.get(library)
  if (cached) return cached
  const index = new TextIndex<{ question: Question }>()
  for (const collection of library) {
    for (const question of collection.questions) index.add(questionHaystack(question), { question })
  }
  questionIndexCache.set(library, index)
  return index
}

/** 纯函数入口，测试可以直接喂一份题库，不依赖 store。 */
export function searchLibrary(
  library: LibraryCollection[],
  rawQuery: string,
  limit = 12,
): SearchResult {
  const query = rawQuery.trim()
  if (!query) return { collections: [], questions: [] }

  const collections = buildCollectionIndex(library)
    .search(query)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 6)
  const questions = buildQuestionIndex(library)
    .search(query)
    .slice(0, limit)
    .map((entry) => entry.question)

  return { collections, questions }
}

export function searchCatalog(rawQuery: string, limit = 12): SearchResult {
  return searchLibrary(getLibraryCollections(), rawQuery, limit)
}

/** 给题库筛选页用：只要题库，不截断，交由调用方按领域/学段再过滤。 */
export function searchCollections(
  library: LibraryCollection[],
  rawQuery: string,
): LibraryCollection[] {
  if (!rawQuery.trim()) return []
  return buildCollectionIndex(library).search(rawQuery)
}

export function collectionTitleOf(collectionId: string): string {
  const imported = getLibraryCollections().find((collection) => collection.id === collectionId)
  if (imported) return imported.title
  return collections.find((collection) => collection.id === collectionId)?.title ?? ''
}
