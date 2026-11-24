import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
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
import { DEFAULT_SETTINGS, HISTORY_LIMIT, PAPER_LIMIT, normalizeSnapshot, type Repository } from './repository'
import { nextBankSnapshots } from './snapshotPolicy'

// Web / Android WebView 的仓储。用 idb 包住原生 IndexedDB，事务边界仍然
// 按业务来划：题库删除要连错题、收藏前缀、快照一起清，历史重放要先回退旧统计。
const DB_NAME = 'tixing'
const DB_VERSION = 1

interface QuizDB extends DBSchema {
  meta: { key: string; value: { key: string; value: unknown } }
  banks: { key: string; value: ImportedBank }
  favorites: { key: string; value: { questionId: string } }
  wrongBook: { key: string; value: WrongEntry }
  history: { key: string; value: HistoryEntry; indexes: { finishedAt: number } }
  daily: { key: string; value: { date: string; answered: number; correct: number } }
  papers: { key: string; value: PaperRecord }
  bankSnapshots: { key: string; value: BankSnapshot }
}

function openDatabase(): Promise<IDBPDatabase<QuizDB>> {
  return openDB<QuizDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' })
      if (!database.objectStoreNames.contains('banks')) database.createObjectStore('banks', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('favorites')) {
        database.createObjectStore('favorites', { keyPath: 'questionId' })
      }
      if (!database.objectStoreNames.contains('wrongBook')) {
        database.createObjectStore('wrongBook', { keyPath: 'questionId' })
      }
      if (!database.objectStoreNames.contains('history')) {
        const store = database.createObjectStore('history', { keyPath: 'id' })
        store.createIndex('finishedAt', 'finishedAt')
      }
      if (!database.objectStoreNames.contains('daily')) database.createObjectStore('daily', { keyPath: 'date' })
      if (!database.objectStoreNames.contains('papers')) database.createObjectStore('papers', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('bankSnapshots')) {
        database.createObjectStore('bankSnapshots', { keyPath: 'id' })
      }
    },
  })
}

async function metaValue<T>(db: IDBPDatabase<QuizDB>, key: string): Promise<T | null> {
  const record = await db.get('meta', key)
  return (record?.value as T) ?? null
}

async function setMeta(db: IDBPDatabase<QuizDB>, key: string, value: unknown): Promise<void> {
  await db.put('meta', { key, value })
}

function trimByDate<T extends { id: string }>(
  items: T[],
  limit: number,
  dateOf: (item: T) => number,
): T[] {
  return [...items].sort((a, b) => dateOf(b) - dateOf(a)).slice(0, limit)
}

export function createIndexedDbRepository(): Repository {
  let databasePromise: Promise<IDBPDatabase<QuizDB>> | null = null

  function database(): Promise<IDBPDatabase<QuizDB>> {
    if (!databasePromise) databasePromise = openDatabase()
    return databasePromise
  }

  return {
    driver: 'indexeddb',
    location: `浏览器 IndexedDB / ${DB_NAME}`,

    async load(): Promise<DataSnapshot> {
      const db = await database()
      const [settings, favorites, wrongBook, history, daily, papers, banks, lastCollectionId, pendingSession, bankSnapshots] =
        await Promise.all([
          metaValue<AppSettings>(db, 'settings'),
          db.getAll('favorites'),
          db.getAll('wrongBook'),
          db.getAll('history'),
          db.getAll('daily'),
          db.getAll('papers'),
          db.getAll('banks'),
          metaValue<string | null>(db, 'lastCollectionId'),
          metaValue<PendingSession | null>(db, 'pendingSession'),
          db.getAll('bankSnapshots'),
        ])
      return normalizeSnapshot({
        settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
        favorites: favorites.map((record) => record.questionId).sort((a, b) => a.localeCompare(b)),
        wrongBook,
        history: [...history].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, HISTORY_LIMIT),
        daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
        lastCollectionId: lastCollectionId ?? null,
        banks: banks.sort((a, b) => b.importedAt - a.importedAt),
        papers: [...papers].sort((a, b) => b.createdAt - a.createdAt).slice(0, PAPER_LIMIT),
        pendingSession: pendingSession ?? null,
        bankSnapshots,
      })
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const db = await database()
      await setMeta(db, 'settings', settings)
    },

    async setLastCollection(collectionId: string | null): Promise<void> {
      const db = await database()
      await setMeta(db, 'lastCollectionId', collectionId)
    },

    async setPendingSession(session: PendingSession | null): Promise<void> {
      const db = await database()
      await setMeta(db, 'pendingSession', session)
    },

    async addBankSnapshot(entry: BankSnapshot): Promise<void> {
      const db = await database()
      const all = await db.getAll('bankSnapshots')
      const sameBank = all.filter((item) => item.bankId === entry.bankId)
      const keptIds = new Set(nextBankSnapshots(all, entry).map((item) => item.id))
      const tx = db.transaction('bankSnapshots', 'readwrite')
      await tx.store.put(entry)
      for (const item of sameBank) if (!keptIds.has(item.id)) await tx.store.delete(item.id)
      await tx.done
    },

    async removeBankSnapshot(snapshotId: string): Promise<void> {
      const db = await database()
      await db.delete('bankSnapshots', snapshotId)
    },

    async clearBankSnapshots(bankId: string): Promise<void> {
      const db = await database()
      const tx = db.transaction('bankSnapshots', 'readwrite')
      for (const item of await tx.store.getAll()) {
        if (item.bankId === bankId) await tx.store.delete(item.id)
      }
      await tx.done
    },

    async setFavorite(questionId: string, favorite: boolean): Promise<void> {
      const db = await database()
      if (favorite) await db.put('favorites', { questionId })
      else await db.delete('favorites', questionId)
    },

    async clearFavorites(): Promise<void> {
      const db = await database()
      await db.clear('favorites')
    },

    async recordWrong(entry: WrongEntry): Promise<void> {
      const db = await database()
      await db.put('wrongBook', entry)
    },

    async removeWrong(questionId: string): Promise<void> {
      const db = await database()
      await db.delete('wrongBook', questionId)
    },

    async clearWrongBook(): Promise<void> {
      const db = await database()
      await db.clear('wrongBook')
    },

    async addHistory(entry: HistoryEntry): Promise<void> {
      const db = await database()
      const tx = db.transaction(['history', 'daily'], 'readwrite')
      const historyStore = tx.objectStore('history')
      const dailyStore = tx.objectStore('daily')
      const adjust = async (dateKey: string, answered: number, correct: number) => {
        const current = await dailyStore.get(dateKey)
        const nextAnswered = Math.max(0, (current?.answered ?? 0) + answered)
        const nextCorrect = Math.max(0, (current?.correct ?? 0) + correct)
        if (nextAnswered === 0 && nextCorrect === 0) await dailyStore.delete(dateKey)
        else await dailyStore.put({ date: dateKey, answered: nextAnswered, correct: nextCorrect })
      }

      // 同一 id 重放：先回退旧记录的统计，再写入新记录，避免重试翻倍。
      const previous = await historyStore.get(entry.id)
      if (previous) {
        await adjust(previous.dateKey, -previous.answered, -previous.correct)
      }
      await historyStore.put(entry)
      await adjust(entry.dateKey, entry.answered, entry.correct)

      const all = await historyStore.getAll()
      const kept = new Set(trimByDate(all, HISTORY_LIMIT, (value) => value.finishedAt).map((value) => value.id))
      for (const value of all) if (!kept.has(value.id)) await historyStore.delete(value.id)
      await tx.done
    },

    async clearHistory(): Promise<void> {
      const db = await database()
      const tx = db.transaction(['history', 'daily'], 'readwrite')
      await tx.objectStore('history').clear()
      await tx.objectStore('daily').clear()
      await tx.done
    },

    async upsertBank(bank: ImportedBank): Promise<void> {
      const db = await database()
      await db.put('banks', bank)
    },

    async deleteBank(bankId: string): Promise<void> {
      const db = await database()
      const tx = db.transaction(['banks', 'wrongBook', 'favorites', 'bankSnapshots'], 'readwrite')
      await tx.objectStore('banks').delete(bankId)
      let wrongCursor = await tx.objectStore('wrongBook').openCursor()
      while (wrongCursor) {
        if (wrongCursor.value.collectionId === bankId) await wrongCursor.delete()
        wrongCursor = await wrongCursor.continue()
      }
      let favoriteCursor = await tx.objectStore('favorites').openCursor()
      const prefix = `${bankId}-`
      while (favoriteCursor) {
        if (String(favoriteCursor.key).startsWith(prefix)) await favoriteCursor.delete()
        favoriteCursor = await favoriteCursor.continue()
      }
      let snapshotCursor = await tx.objectStore('bankSnapshots').openCursor()
      while (snapshotCursor) {
        if (snapshotCursor.value.bankId === bankId) await snapshotCursor.delete()
        snapshotCursor = await snapshotCursor.continue()
      }
      await tx.done
    },

    async addPaper(paper: PaperRecord): Promise<void> {
      const db = await database()
      const tx = db.transaction('papers', 'readwrite')
      await tx.store.put(paper)
      const kept = new Set(trimByDate(await tx.store.getAll(), PAPER_LIMIT, (item) => item.createdAt).map((item) => item.id))
      for (const item of await tx.store.getAll()) if (!kept.has(item.id)) await tx.store.delete(item.id)
      await tx.done
    },

    async removePaper(paperId: string): Promise<void> {
      const db = await database()
      await db.delete('papers', paperId)
    },

    async resetProgress(): Promise<void> {
      const db = await database()
      const tx = db.transaction(['favorites', 'wrongBook', 'history', 'daily', 'meta'], 'readwrite')
      await tx.objectStore('favorites').clear()
      await tx.objectStore('wrongBook').clear()
      await tx.objectStore('history').clear()
      await tx.objectStore('daily').clear()
      await tx.objectStore('meta').delete('lastCollectionId')
      await tx.objectStore('meta').delete('pendingSession')
      await tx.done
    },

    async replaceAll(snapshot: DataSnapshot): Promise<void> {
      const db = await database()
      const tx = db.transaction(
        ['meta', 'banks', 'favorites', 'wrongBook', 'history', 'daily', 'papers', 'bankSnapshots'],
        'readwrite',
      )
      await tx.objectStore('banks').clear()
      await tx.objectStore('favorites').clear()
      await tx.objectStore('wrongBook').clear()
      await tx.objectStore('history').clear()
      await tx.objectStore('daily').clear()
      await tx.objectStore('papers').clear()
      await tx.objectStore('bankSnapshots').clear()
      await tx.objectStore('meta').clear()

      for (const bank of snapshot.banks) await tx.objectStore('banks').put(bank)
      for (const questionId of snapshot.favorites) await tx.objectStore('favorites').put({ questionId })
      for (const entry of Object.values(snapshot.wrongBook)) await tx.objectStore('wrongBook').put(entry)
      for (const entry of snapshot.history) await tx.objectStore('history').put(entry)
      for (const entry of Object.values(snapshot.daily)) await tx.objectStore('daily').put(entry)
      for (const paper of snapshot.papers) await tx.objectStore('papers').put(paper)
      for (const item of snapshot.bankSnapshots) await tx.objectStore('bankSnapshots').put(item)
      await tx.objectStore('meta').put({ key: 'settings', value: snapshot.settings })
      await tx.objectStore('meta').put({ key: 'lastCollectionId', value: snapshot.lastCollectionId })
      await tx.objectStore('meta').put({ key: 'pendingSession', value: snapshot.pendingSession })
      await tx.done
    },

    async close(): Promise<void> {
      const db = await database()
      db.close()
      databasePromise = null
    },
  }
}
