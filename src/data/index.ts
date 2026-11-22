import { collections } from './taxonomy'
import { makeQuestions } from './types'
import type { CollectionWithQuestions, Question } from './types'
import { k12Seeds } from './questions/k12'
import { universitySeeds } from './questions/university'
import { careerSeeds } from './questions/career'
import { languageSeeds } from './questions/language'
import { codingSeeds } from './questions/coding'
import { publicSeeds } from './questions/public'
import { generalSeeds } from './questions/general'

// 延迟注入：避免 data → library → store 的模块级循环依赖。
let importedLookup: {
  collection: (id: string) => CollectionWithQuestions | undefined
  question: (id: string) => Question | undefined
} | null = null

export function registerImportedLookup(lookup: {
  collection: (id: string) => CollectionWithQuestions | undefined
  question: (id: string) => Question | undefined
}): void {
  importedLookup = lookup
}

function lookupImportedCollection(id: string): CollectionWithQuestions | undefined {
  return importedLookup?.collection(id)
}

function lookupImportedQuestion(id: string): Question | undefined {
  return importedLookup?.question(id)
}

/**
 * 示例题库可通过构建期开关整体剥离。
 *
 * 为什么用构建期而不是运行时开关：运行时隐藏只是不显示，题库源码仍会打进
 * 主 bundle（约 84 KB 源码）。企业内训、白标分发这类场景要的是「包里根本
 * 没有别人的题目」，所以用 `import.meta.env.VITE_BARE_CONTENT` 让打包器
 * 在构建阶段整块摇掉 questions/* 的引用。
 *
 * 开启方式：`VITE_BARE_CONTENT=1 pnpm build`（见 docs/CROSS_PLATFORM.md）。
 */
const BARE_CONTENT = import.meta.env.VITE_BARE_CONTENT === '1'

const seeds: Record<string, Parameters<typeof makeQuestions>[1]> = BARE_CONTENT
  ? {}
  : {
      ...k12Seeds,
      ...universitySeeds,
      ...careerSeeds,
      ...languageSeeds,
      ...codingSeeds,
      ...publicSeeds,
      ...generalSeeds,
    }

/** 裸内容构建下不产出任何内置题库；分类树保留，用于给导入的题库归类。 */
export const builtinQuestionBank: CollectionWithQuestions[] = BARE_CONTENT
  ? []
  : collections.map((collection) => ({
      ...collection,
      questions: makeQuestions(collection.id, seeds[collection.id] ?? []),
    }))

/** 供界面判断当前是否为裸内容构建（不展示示例相关文案）。 */
export const isBareContentBuild = BARE_CONTENT

// 兼容旧引用：示例题库即内置题库。运行期统一从 src/lib/library.ts 取合并视图。
export const questionBank = builtinQuestionBank

const byId = new Map(builtinQuestionBank.map((item) => [item.id, item]))
const questionById = new Map<string, Question>()
for (const collection of builtinQuestionBank) {
  for (const question of collection.questions) {
    questionById.set(question.id, question)
  }
}

export function getCollection(id: string): CollectionWithQuestions | undefined {
  const builtin = byId.get(id)
  if (builtin) return builtin
  // 导入题库不在内置映射里，从合并视图取（含 React 外的同步快照）。
  const imported = lookupImportedCollection(id)
  return imported ?? undefined
}

export function getQuestion(id: string): Question | undefined {
  const builtin = questionById.get(id)
  if (builtin) return builtin
  return lookupImportedQuestion(id)
}

export function getCollectionOfQuestion(questionId: string): CollectionWithQuestions | undefined {
  const question = questionById.get(questionId)
  return question ? byId.get(question.collectionId) : undefined
}

export const totalQuestions = questionBank.reduce(
  (sum, collection) => sum + collection.questions.length,
  0,
)

export function questionsOfDomain(domainId: string): Question[] {
  return questionBank
    .filter((collection) => collection.domainId === domainId)
    .flatMap((collection) => collection.questions)
}
