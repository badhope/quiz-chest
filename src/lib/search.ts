import { collections, domains } from '../data/taxonomy'
import { getLibraryCollections, type LibraryCollection } from './library'
import type { Question } from '../data/types'

export interface SearchResult {
  collections: LibraryCollection[]
  questions: Question[]
}

function currentBanks(): LibraryCollection[] {
  return getLibraryCollections()
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

export function searchCatalog(rawQuery: string, limit = 12): SearchResult {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return { collections: [], questions: [] }

  const bank = currentBanks()
  const domainNameById = new Map(domains.map((domain) => [domain.id, domain.name]))

  const collectionResults = bank
    .filter((collection) => {
      const haystack = [
        collection.title,
        collection.subtitle,
        collection.description,
        collection.exam,
        domainNameById.get(collection.domainId) ?? '',
        ...collection.tags,
        ...(aliases[collection.id] ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 6)

  const questionResults = bank
    .flatMap((collection) => collection.questions)
    .filter((question) => {
      const haystack = [question.stem, ...question.tags, ...question.options].join(' ').toLowerCase()
      return haystack.includes(query)
    })
    .slice(0, limit)

  return { collections: collectionResults, questions: questionResults }
}

export function collectionTitleOf(collectionId: string): string {
  const imported = currentBanks().find((collection) => collection.id === collectionId)
  if (imported) return imported.title
  return collections.find((collection) => collection.id === collectionId)?.title ?? ''
}
