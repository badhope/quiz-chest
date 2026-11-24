import type {
  AppSettings,
  DataSnapshot,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  WrongEntry,
} from '../data/records'
import {
  PAPER_LIMIT,
  emptySnapshot,
  toDaily,
  toWrongBook,
  type Repository,
} from './repository'
import { nextBankSnapshots } from './snapshotPolicy'
import { mergeHistoryEntry } from '../lib/history'
import { createIndexedDbRepository } from './indexedDbRepository'
import { createSqliteRepository, rebuildDatabase as rebuildSqlite, sqliteLocation } from './sqliteRepository'

// 按运行环境挑仓储：Tauri 走 SQLite，Android/Web 走 IndexedDB，
// 两者都开不了就退到内存并挂降级标记。Web 端不假装有 SQLite。
export interface DataLayerHealth {
  driver: Repository['driver']
  location: string
  degraded: boolean
  message: string | null
}

type HealthListener = (health: DataLayerHealth) => void

const listeners = new Set<HealthListener>()
let health: DataLayerHealth = {
  driver: 'memory',
  location: '内存（仅本次会话）',
  degraded: false,
  message: null,
}
let repository: Repository | null = null

export function onDataLayerHealth(listener: HealthListener): () => void {
  listeners.add(listener)
  listener(health)
  return () => listeners.delete(listener)
}

export function getDataLayerHealth(): DataLayerHealth {
  return health
}

function publish(next: DataLayerHealth): void {
  health = next
  for (const listener of listeners) listener(next)
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

export function createMemoryRepository(): Repository {
  let snapshot: DataSnapshot = emptySnapshot()
  return {
    driver: 'memory',
    location: '内存（仅本次会话）',
    async load() {
      return structuredClone(snapshot)
    },
    async saveSettings(settings: AppSettings) {
      snapshot.settings = { ...settings }
    },
    async setLastCollection(collectionId) {
      snapshot.lastCollectionId = collectionId
    },
    async setPendingSession(session) {
      snapshot.pendingSession = session ? { ...session } : null
    },
    async addBankSnapshot(entry) {
      snapshot.bankSnapshots = nextBankSnapshots(snapshot.bankSnapshots, entry)
    },
    async removeBankSnapshot(snapshotId) {
      snapshot.bankSnapshots = snapshot.bankSnapshots.filter((item) => item.id !== snapshotId)
    },
    async clearBankSnapshots(bankId) {
      snapshot.bankSnapshots = snapshot.bankSnapshots.filter((item) => item.bankId !== bankId)
    },
    async setFavorite(questionId, favorite) {
      const set = new Set(snapshot.favorites)
      if (favorite) set.add(questionId)
      else set.delete(questionId)
      snapshot.favorites = [...set]
    },
    async clearFavorites() {
      snapshot.favorites = []
    },
    async recordWrong(entry: WrongEntry) {
      snapshot.wrongBook = {
        ...snapshot.wrongBook,
        [entry.questionId]: { ...entry },
      }
    },
    async removeWrong(questionId) {
      const next = { ...snapshot.wrongBook }
      delete next[questionId]
      snapshot.wrongBook = next
    },
    async clearWrongBook() {
      snapshot.wrongBook = {}
    },
    async addHistory(entry: HistoryEntry) {
      const merged = mergeHistoryEntry(snapshot.history, snapshot.daily, entry)
      snapshot.history = merged.history
      snapshot.daily = merged.daily
    },
    async clearHistory() {
      snapshot.history = []
      snapshot.daily = {}
    },
    async upsertBank(bank: ImportedBank) {
      // 与两个数据库实现一致：按 importedAt 倒序，编辑旧题库不会跳到最前面。
      snapshot.banks = [bank, ...snapshot.banks.filter((item) => item.id !== bank.id)].sort(
        (a, b) => b.importedAt - a.importedAt,
      )
    },
    async deleteBank(bankId) {
      // 与 SQLite / IndexedDB 保持一致：题库、错题、收藏必须一起清，
      // 否则设置页会把已无题目的孤儿行也算进错题数。
      snapshot.banks = snapshot.banks.filter((item) => item.id !== bankId)
      snapshot.wrongBook = Object.fromEntries(
        Object.entries(snapshot.wrongBook).filter(([, entry]) => entry.collectionId !== bankId),
      )
      const prefix = `${bankId}-`
      snapshot.favorites = snapshot.favorites.filter((id) => !id.startsWith(prefix))
      snapshot.bankSnapshots = snapshot.bankSnapshots.filter((item) => item.bankId !== bankId)
    },
    async addPaper(paper: PaperRecord) {
      snapshot.papers = [paper, ...snapshot.papers.filter((item) => item.id !== paper.id)]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, PAPER_LIMIT)
    },
    async removePaper(paperId) {
      snapshot.papers = snapshot.papers.filter((item) => item.id !== paperId)
    },
    async resetProgress() {
      snapshot = {
        ...snapshot,
        favorites: [],
        wrongBook: {},
        history: [],
        daily: {},
        lastCollectionId: null,
        pendingSession: null,
      }
    },
    async replaceAll(next: DataSnapshot) {
      snapshot = structuredClone(next)
    },
    async close() {},
  }
}

/**
 * 隔离无法打开的数据库并新建空库（仅桌面端可用）。
 *
 * 返回被隔离文件的路径；Web 端没有这个概念，直接返回 null。
 */
export async function rebuildDatabase(): Promise<string | null> {
  if (!isTauri()) return null
  const quarantined = await rebuildSqlite()
  // 旧连接已失效，清掉缓存让下一次取仓储时重新构建。
  repository = null
  return quarantined
}

/** 幂等：多次调用返回同一个仓储实例。 */
export async function getRepository(): Promise<Repository> {
  if (repository) return repository

  if (isTauri()) {
    repository = createSqliteRepository()
    const location = await sqliteLocation()
    publish({ driver: 'sqlite', location, degraded: false, message: null })
    return repository
  }

  if (indexedDbAvailable()) {
    repository = createIndexedDbRepository()
    publish({ driver: 'indexeddb', location: repository.location, degraded: false, message: null })
    return repository
  }

  repository = createMemoryRepository()
  publish({
    driver: 'memory',
    location: '内存（仅本次会话）',
    degraded: true,
    message: '当前环境无法打开本地数据库，本次改动不会被保存。',
  })
  return repository
}

/** 仅供测试注入。 */
export function setRepositoryForTest(next: Repository | null): void {
  repository = next
}

export function resetRepositoryForTest(): void {
  repository = null
  listeners.clear()
  health = {
    driver: 'memory',
    location: '内存（仅本次会话）',
    degraded: false,
    message: null,
  }
}

export { toDaily, toWrongBook }
