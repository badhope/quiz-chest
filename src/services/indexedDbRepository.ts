import type {
  AppSettings,
  BankSnapshot,
  DataSnapshot,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  PendingSession,
  WrongEntry,
} from '../data/records'
import { normalizeSnapshot, type Repository } from './repository'
import { BANK_SNAPSHOT_LIMIT } from './snapshotPolicy'

/**
 * 浏览器仓储：IndexedDB。
 *
 * 为什么不是 localStorage：localStorage 容量约 5MB、同步阻塞主线程、
 * 只能存字符串、没有索引与事务。导入几个大题库就会触发
 * `QuotaExceededError`，而且每次写入都阻塞渲染。IndexedDB 是异步、
 * 可索引、容量按磁盘配额给，适合题库这类结构化数据。
 *
 * 结构：一个数据库 `quizchest`，若干对象仓库各自以主键存取，
 * 与 SQLite 的表一一对应，保证两端语义一致。
 */

const DB_NAME = 'quizchest'
const DB_VERSION = 1

export const STORES = {
  meta: 'meta',
  banks: 'banks',
  favorites: 'favorites',
  wrong: 'wrongBook',
  history: 'history',
  daily: 'daily',
  papers: 'papers',
  bankSnapshots: 'bankSnapshots',
} as const

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORES.meta)) {
        database.createObjectStore(STORES.meta, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(STORES.banks)) {
        database.createObjectStore(STORES.banks, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(STORES.favorites)) {
        database.createObjectStore(STORES.favorites, { keyPath: 'questionId' })
      }
      if (!database.objectStoreNames.contains(STORES.wrong)) {
        database.createObjectStore(STORES.wrong, { keyPath: 'questionId' })
      }
      const history = database.createObjectStore(STORES.history, { keyPath: 'id' })
      history.createIndex('finishedAt', 'finishedAt')
      if (!database.objectStoreNames.contains(STORES.daily)) {
        database.createObjectStore(STORES.daily, { keyPath: 'date' })
      }
      if (!database.objectStoreNames.contains(STORES.papers)) {
        database.createObjectStore(STORES.papers, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(STORES.bankSnapshots)) {
        database.createObjectStore(STORES.bankSnapshots, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('数据库操作失败'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('数据库事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('数据库事务已中止'))
  })
}

function getAll<T>(database: IDBDatabase, store: string): Promise<T[]> {
  const tx = database.transaction(store, 'readonly')
  return requestToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>)
}

function putAll(database: IDBDatabase, store: string, values: unknown[]): Promise<void> {
  const tx = database.transaction(store, 'readwrite')
  const target = tx.objectStore(store)
  for (const value of values) target.put(value)
  return transactionDone(tx)
}

function deleteAll(database: IDBDatabase, store: string): Promise<void> {
  const tx = database.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  return transactionDone(tx)
}

async function readMeta<T>(database: IDBDatabase, key: string): Promise<T | null> {
  const tx = database.transaction(STORES.meta, 'readonly')
  const record = await requestToPromise<{ key: string; value: T } | undefined>(
    tx.objectStore(STORES.meta).get(key),
  )
  return record ? record.value : null
}

function writeMeta(
  database: IDBDatabase,
  entries: Array<{ key: string; value: unknown }>,
): Promise<void> {
  return putAll(database, STORES.meta, entries)
}

export function createIndexedDbRepository(): Repository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function database(): Promise<IDBDatabase> {
    if (!databasePromise) databasePromise = openDatabase()
    return databasePromise
  }

  async function settingsOf(db: IDBDatabase): Promise<AppSettings> {
    const stored = await readMeta<AppSettings>(db, 'settings')
    return {
      theme: stored?.theme ?? 'light',
      fontScale: stored?.fontScale ?? 'normal',
      autoNext: stored?.autoNext ?? false,
      showSampleBanks: stored?.showSampleBanks ?? true,
    }
  }

  return {
    driver: 'indexeddb',
    location: `浏览器 IndexedDB / ${DB_NAME}`,

    async load(): Promise<DataSnapshot> {
      const db = await database()
      const [settings, favorites, wrong, history, daily, papers, banks, lastCollectionId, pendingSession, bankSnapshots] =
        await Promise.all([
          settingsOf(db),
          getAll<{ questionId: string }>(db, STORES.favorites),
          getAll<WrongEntry>(db, STORES.wrong),
          getAll<HistoryEntry>(db, STORES.history),
          getAll<{ date: string; answered: number; correct: number }>(db, STORES.daily),
          getAll<PaperRecord>(db, STORES.papers),
          getAll<ImportedBank>(db, STORES.banks),
          readMeta<string | null>(db, 'lastCollectionId'),
          readMeta<PendingSession | null>(db, 'pendingSession'),
          getAll<BankSnapshot>(db, STORES.bankSnapshots),
        ])
      const sortedHistory = [...history].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 100)
      return normalizeSnapshot({
        settings,
        favorites: favorites
          .map((record) => record.questionId)
          .sort((a, b) => a.localeCompare(b)),
        wrongBook: wrong,
        history: sortedHistory,
        daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
        lastCollectionId: lastCollectionId ?? null,
        banks: banks.sort((a, b) => b.importedAt - a.importedAt),
        papers: papers.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
        pendingSession: pendingSession ?? null,
        bankSnapshots,
      })
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const db = await database()
      await writeMeta(db, [{ key: 'settings', value: settings }])
    },

    async setLastCollection(collectionId: string | null): Promise<void> {
      const db = await database()
      await writeMeta(db, [{ key: 'lastCollectionId', value: collectionId }])
    },

    async setPendingSession(session: PendingSession | null): Promise<void> {
      const db = await database()
      await writeMeta(db, [{ key: 'pendingSession', value: session }])
    },

    async addBankSnapshot(entry: BankSnapshot): Promise<void> {
      const db = await database()
      await putAll(db, STORES.bankSnapshots, [entry])
      await trimBankSnapshots(db, entry.bankId, BANK_SNAPSHOT_LIMIT)
    },

    async removeBankSnapshot(snapshotId: string): Promise<void> {
      const db = await database()
      const tx = db.transaction(STORES.bankSnapshots, 'readwrite')
      tx.objectStore(STORES.bankSnapshots).delete(snapshotId)
      await transactionDone(tx)
    },

    async clearBankSnapshots(bankId: string): Promise<void> {
      const db = await database()
      const all = await getAll<BankSnapshot>(db, STORES.bankSnapshots)
      const stale = all.filter((item) => item.bankId === bankId)
      if (stale.length === 0) return
      const tx = db.transaction(STORES.bankSnapshots, 'readwrite')
      for (const item of stale) tx.objectStore(STORES.bankSnapshots).delete(item.id)
      await transactionDone(tx)
    },

    async setFavorite(questionId: string, favorite: boolean): Promise<void> {
      const db = await database()
      const tx = db.transaction(STORES.favorites, 'readwrite')
      if (favorite) {
        tx.objectStore(STORES.favorites).put({ questionId })
      } else {
        tx.objectStore(STORES.favorites).delete(questionId)
      }
      await transactionDone(tx)
    },

    async clearFavorites(): Promise<void> {
      const db = await database()
      await deleteAll(db, STORES.favorites)
    },

    async recordWrong(entry: WrongEntry): Promise<void> {
      const db = await database()
      await putAll(db, STORES.wrong, [entry])
    },

    async removeWrong(questionId: string): Promise<void> {
      const db = await database()
      const tx = db.transaction(STORES.wrong, 'readwrite')
      tx.objectStore(STORES.wrong).delete(questionId)
      await transactionDone(tx)
    },

    async clearWrongBook(): Promise<void> {
      const db = await database()
      await deleteAll(db, STORES.wrong)
    },

    async addHistory(entry: HistoryEntry): Promise<void> {
      const db = await database()
      const tx = db.transaction([STORES.history, STORES.daily], 'readwrite')
      tx.objectStore(STORES.history).put(entry)
      const dailyStore = tx.objectStore(STORES.daily)
      const current = await requestToPromise<{ date: string; answered: number; correct: number } | undefined>(
        dailyStore.get(entry.dateKey),
      )
      dailyStore.put({
        date: entry.dateKey,
        answered: (current?.answered ?? 0) + entry.answered,
        correct: (current?.correct ?? 0) + entry.correct,
      })
      await transactionDone(tx)
      await trimHistory(db, 100)
    },

    async clearHistory(): Promise<void> {
      const db = await database()
      await Promise.all([deleteAll(db, STORES.history), deleteAll(db, STORES.daily)])
    },

    async upsertBank(bank: ImportedBank): Promise<void> {
      const db = await database()
      await putAll(db, STORES.banks, [bank])
    },

    async deleteBank(bankId: string): Promise<void> {
      const db = await database()
      // 与 SQLite 端 db_delete_bank 保持一致：删除题库的同时清掉
      // 指向它的错题与收藏，避免留下统计口径对不上的孤儿行。
      const tx = db.transaction([STORES.banks, STORES.wrong, STORES.favorites], 'readwrite')
      tx.objectStore(STORES.banks).delete(bankId)
      const wrong = tx.objectStore(STORES.wrong)
      const wrongKeys = await requestToPromise<IDBValidKey[]>(wrong.getAllKeys())
      for (const key of wrongKeys) {
        const entry = (await requestToPromise(wrong.get(key))) as WrongEntry | undefined
        if (entry?.collectionId === bankId) wrong.delete(key)
      }
      const favorites = tx.objectStore(STORES.favorites)
      const prefix = `${bankId}-`
      const favoriteKeys = await requestToPromise<IDBValidKey[]>(favorites.getAllKeys())
      for (const key of favoriteKeys) {
        if (String(key).startsWith(prefix)) favorites.delete(key)
      }
      await transactionDone(tx)
    },

    async addPaper(paper: PaperRecord): Promise<void> {
      const db = await database()
      await putAll(db, STORES.papers, [paper])
      await trimPapers(db, 20)
    },

    async removePaper(paperId: string): Promise<void> {
      const db = await database()
      const tx = db.transaction(STORES.papers, 'readwrite')
      tx.objectStore(STORES.papers).delete(paperId)
      await transactionDone(tx)
    },

    async resetProgress(): Promise<void> {
      const db = await database()
      await Promise.all([
        deleteAll(db, STORES.favorites),
        deleteAll(db, STORES.wrong),
        deleteAll(db, STORES.history),
        deleteAll(db, STORES.daily),
      ])
      await writeMeta(db, [
        { key: 'lastCollectionId', value: null },
        { key: 'pendingSession', value: null },
      ])
    },

    async replaceAll(snapshot: DataSnapshot): Promise<void> {
      const db = await database()
      const stores = Object.values(STORES)
      const tx = db.transaction(stores, 'readwrite')
      for (const store of stores) tx.objectStore(store).clear()
      tx.objectStore(STORES.meta).put({ key: 'settings', value: snapshot.settings })
      tx.objectStore(STORES.meta).put({
        key: 'lastCollectionId',
        value: snapshot.lastCollectionId,
      })
      tx.objectStore(STORES.meta).put({
        key: 'pendingSession',
        value: snapshot.pendingSession,
      })
      for (const questionId of snapshot.favorites) {
        tx.objectStore(STORES.favorites).put({ questionId })
      }
      for (const entry of Object.values(snapshot.wrongBook)) {
        tx.objectStore(STORES.wrong).put(entry)
      }
      for (const entry of snapshot.history) tx.objectStore(STORES.history).put(entry)
      for (const entry of Object.values(snapshot.daily)) tx.objectStore(STORES.daily).put(entry)
      for (const bank of snapshot.banks) tx.objectStore(STORES.banks).put(bank)
      for (const paper of snapshot.papers) tx.objectStore(STORES.papers).put(paper)
      for (const entry of snapshot.bankSnapshots) {
        tx.objectStore(STORES.bankSnapshots).put(entry)
      }
      await transactionDone(tx)
    },

    async close(): Promise<void> {
      if (!databasePromise) return
      const db = await databasePromise
      db.close()
      databasePromise = null
    },
  }
}

async function trimHistory(database: IDBDatabase, keep: number): Promise<void> {
  const all = await getAll<HistoryEntry>(database, STORES.history)
  if (all.length <= keep) return
  const stale = all.sort((a, b) => b.finishedAt - a.finishedAt).slice(keep)
  const tx = database.transaction(STORES.history, 'readwrite')
  for (const entry of stale) tx.objectStore(STORES.history).delete(entry.id)
  await transactionDone(tx)
}

async function trimPapers(database: IDBDatabase, keep: number): Promise<void> {
  const all = await getAll<PaperRecord>(database, STORES.papers)
  if (all.length <= keep) return
  const stale = all.sort((a, b) => b.createdAt - a.createdAt).slice(keep)
  const tx = database.transaction(STORES.papers, 'readwrite')
  for (const paper of stale) tx.objectStore(STORES.papers).delete(paper.id)
  await transactionDone(tx)
}


async function trimBankSnapshots(
  database: IDBDatabase,
  bankId: string,
  limit: number,
): Promise<void> {
  const all = await getAll<BankSnapshot>(database, STORES.bankSnapshots)
  const sameBank = all.filter((item) => item.bankId === bankId)
  if (sameBank.length <= limit) return
  const stale = sameBank.sort((a, b) => b.savedAt - a.savedAt).slice(limit)
  const tx = database.transaction(STORES.bankSnapshots, 'readwrite')
  for (const item of stale) tx.objectStore(STORES.bankSnapshots).delete(item.id)
  await transactionDone(tx)
}
