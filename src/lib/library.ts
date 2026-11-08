import { useSyncExternalStore } from 'react'
import { questionBank as builtinBank, registerImportedLookup } from '../data'
import { collections as builtinCollections, domains, tracks } from '../data/taxonomy'
import type { CollectionWithQuestions, Domain, IconKey, Question, Track } from '../data/types'
import type { BankMeta, QuestionBankOrigin } from './bankRegistry'
import { onBanksChange } from './bankRegistry'
import { useAppStore } from '../store/useAppStore'
import type { ImportedBank } from '../store/useAppStore'
import { dateKey } from './quiz'
import { makeImportedQuestion } from './bankRegistry'

export interface LibraryCollection extends CollectionWithQuestions {
  origin: QuestionBankOrigin
  importedAt: number
  accent: string
}

export interface LibraryDomain extends Domain {
  origin: QuestionBankOrigin
}

const importedDomain: LibraryDomain = {
  ...domains[0],
  id: 'imported',
  name: '我的题库',
  en: 'My Bank',
  tagline: '导入与自建',
  description: '你自己导入的题库，数据保存在本机，可随时删除。',
  icon: 'book',
  accent: '#7A5C2E',
  index: 'MY',
  origin: 'imported',
}

function toLibraryCollection(bank: ImportedBank): LibraryCollection {
  const questions: Question[] = bank.questions.map((seed, index) =>
    makeImportedQuestion(bank.id, index, seed),
  )
  return {
    id: bank.id,
    domainId: 'imported',
    trackId: `imported-${bank.id}`,
    title: bank.title,
    subtitle: bank.subtitle,
    description: bank.description,
    icon: (bank.icon as IconKey) ?? 'book',
    level: bank.level,
    exam: bank.exam,
    durationMin: bank.durationMin,
    heat: 0,
    tags: bank.tags,
    updated: dateKey(bank.importedAt),
    questions,
    origin: 'imported',
    importedAt: bank.importedAt,
    accent: bank.accent,
  }
}

function snapshot(): LibraryCollection[] {
  const state = useAppStore.getState()
  const showSample = state.settings.showSampleBanks
  const imported = state.banks.map(toLibraryCollection)
  const builtin: LibraryCollection[] = showSample
    ? builtinBank.map((collection) => ({
        ...collection,
        origin: 'builtin' as const,
        importedAt: 0,
        accent: domains.find((domain) => domain.id === collection.domainId)?.accent ?? '#315B7D',
      }))
    : []
  return [...imported, ...builtin]
}

let cache: { key: string; value: LibraryCollection[] } | null = null
let listenerVersion = 0

function cacheKey(): string {
  const state = useAppStore.getState()
  return `${state.banksVersion}|${state.settings.showSampleBanks ? 1 : 0}|${listenerVersion}`
}

function subscribe(listener: () => void): () => void {
  const wrapped = () => {
    listenerVersion += 1
    listener()
  }
  const offRegistry = onBanksChange(wrapped)
  const offStore = useAppStore.subscribe(wrapped)
  return () => {
    offRegistry()
    offStore()
  }
}

export function useLibraryCollections(): LibraryCollection[] {
  return useSyncExternalStore(subscribe, () => {
    const key = cacheKey()
    if (cache?.key !== key) {
      cache = { key, value: snapshot() }
    }
    return cache.value
  })
}

export function getLibraryCollections(): LibraryCollection[] {
  return snapshot()
}

export function useLibraryDomains(): LibraryDomain[] {
  const collections = useLibraryCollections()
  const used = new Set(collections.map((collection) => collection.domainId))
  const result: LibraryDomain[] = []
  if (used.has('imported')) result.push(importedDomain)
  for (const domain of domains) {
    if (used.has(domain.id)) result.push({ ...domain, origin: 'builtin' })
  }
  return result
}

export function findLibraryCollection(
  collections: LibraryCollection[],
  id: string,
): LibraryCollection | undefined {
  return collections.find((collection) => collection.id === id)
}

export function findLibraryQuestion(
  collections: LibraryCollection[],
  id: string,
): Question | undefined {
  for (const collection of collections) {
    const question = collection.questions.find((item) => item.id === id)
    if (question) return question
  }
  return undefined
}

export function libraryDomainOf(
  domainList: LibraryDomain[],
  domainId: string,
): LibraryDomain | undefined {
  return domainList.find((domain) => domain.id === domainId)
}

export function libraryTracksOfDomain(tracks: LibraryCollection[], domainId: string): Track[] {
  const seen = new Set<string>()
  const result: Track[] = []
  for (const collection of tracks) {
    if (collection.domainId !== domainId || seen.has(collection.trackId)) continue
    seen.add(collection.trackId)
    result.push({
      id: collection.trackId,
      domainId,
      name: collection.title,
      short: collection.subtitle.slice(0, 4),
      description: collection.description,
    })
  }
  return result
}

export type { BankMeta }
export const sampleBankCount = builtinCollections.length
export const allTracks = tracks

// getCollection / getQuestion 的导入题库兜底（库加载时注册一次）。
registerImportedLookup({
  collection: (id) =>
    useAppStore
      .getState()
      .banks.map(toLibraryCollection)
      .find((collection) => collection.id === id),
  question: (id) => {
    const bankId = id.substring(0, id.lastIndexOf('-'))
    const bank = useAppStore.getState().banks.find((item) => item.id === bankId)
    if (!bank) return undefined
    const index = Number(id.substring(id.lastIndexOf('-') + 1)) - 1
    const seed = bank.questions[index]
    if (!seed) return undefined
    return makeImportedQuestion(bank.id, index, seed)
  },
})
