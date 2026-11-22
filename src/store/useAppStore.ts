import { create } from 'zustand'
import type {
  AppSettings,
  DataSnapshot,
  DailyStat,
  HistoryEntry,
  ImportedBank,
  BankSnapshot,
  PaperRecord,
  PendingSession,
  WrongEntry,
} from '../data/records'
import { DEFAULT_SETTINGS, emptySnapshot } from '../services/repository'
import { getRepository, setRepositoryForTest } from '../services/dataLayer'
import type { Repository } from '../services/repository'
import { resilientStorage } from '../lib/storage'
import { BANK_SNAPSHOT_LIMIT } from '../services/snapshotPolicy'

export type {
  AppSettings,
  DailyStat,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  WrongEntry,
}

/** 旧版 localStorage 键，仅用于一次性迁移。 */
const LEGACY_STORAGE_KEY = 'tiyu-store-v1'

export type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AppState {
  settings: AppSettings
  favorites: string[]
  wrongBook: Record<string, WrongEntry>
  history: HistoryEntry[]
  daily: Record<string, DailyStat>
  lastCollectionId: string | null
  banks: ImportedBank[]
  banksVersion: number
  papers: PaperRecord[]
  /** 未完成的练习；有值时首页与题库页可提示「继续上次」。 */
  pendingSession: PendingSession | null
  /** 题库历史版本，按 bankId 过滤使用。 */
  bankSnapshots: BankSnapshot[]
  hydration: HydrationStatus
  hydrationError: string | null
  persistenceError: string | null

  hydrate: () => Promise<void>
  setTheme: (theme: AppSettings['theme']) => void
  toggleTheme: () => void
  setFontScale: (scale: AppSettings['fontScale']) => void
  setAutoNext: (value: boolean) => void
  setShowSampleBanks: (value: boolean) => void
  toggleFavorite: (questionId: string) => void
  clearFavorites: () => void
  recordWrong: (entry: Omit<WrongEntry, 'wrongCount' | 'lastWrongAt'>) => void
  removeWrong: (questionId: string) => void
  clearWrongBook: () => void
  addHistory: (entry: HistoryEntry) => void
  clearHistory: () => void
  setLastCollection: (collectionId: string) => void
  savePendingSession: (session: PendingSession) => void
  clearPendingSession: () => void
  /** 编辑题库前把旧版本压进历史；返回新建的快照（含 revision）。 */
  archiveBankVersion: (bank: ImportedBank) => BankSnapshot | null
  /** 回滚到某个历史版本：当前版本会先被存档，不会丢。 */
  rollbackBankVersion: (snapshotId: string) => Promise<void>
  removeBankSnapshot: (snapshotId: string) => void
  /**
   * 返回 Promise 的操作是「用户会看到保存结果」的那几个。
   * 界面必须 await 后再提示成功，落库失败要能报出来。
   */
  /**
   * 这两个操作会 reject：用户明确点了「保存/恢复」，失败必须报出来。
   * 其余写操作是即发即忘的，只把错误写进 persistenceError。
   */
  addBank: (bank: ImportedBank) => Promise<boolean>
  removeBank: (bankId: string) => void
  addPaper: (paper: PaperRecord) => void
  removePaper: (paperId: string) => void
  resetProgress: () => void
  restoreBackup: (data: {
    settings: AppSettings
    favorites: string[]
    wrongBook: Record<string, WrongEntry>
    history: HistoryEntry[]
    daily: Record<string, DailyStat>
    banks: ImportedBank[]
    papers: PaperRecord[]
  }) => Promise<boolean>
}

let repository: Repository | null = null

/**
 * 写操作统一汇入此处：先更新内存状态让界面立刻响应，再异步落库。
 *
 * 返回 Promise，但**默认不 reject**：绝大多数调用点（改主题、收藏、记录错题）
 * 是即发即忘的，让它们产生未处理 rejection 会在浏览器里刷出 40 条
 * "Uncaught (in promise)"，既污染控制台也可能触发全局错误上报。
 *
 * 需要「保存失败必须让用户知道」的调用方（编辑器、备份恢复）传
 * `{ rethrow: true }`，拿到 reject 后自己提示；错误同时写进
 * `persistenceError`，设置页始终可见。
 */
type PersistOptions = { rethrow?: boolean }

function persist(
  task: (repo: Repository) => Promise<void>,
  options: PersistOptions = {},
): Promise<boolean> {
  const fail = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error)
    useAppStore.setState({ persistenceError: message })
    return false
  }

  if (!repository) {
    const error = new Error('数据层尚未就绪，改动未保存')
    const ok = fail(error)
    return options.rethrow ? Promise.reject(error) : Promise.resolve(ok)
  }

  return task(repository)
    .then(() => true)
    .catch((error: unknown) => {
      const ok = fail(error)
      if (options.rethrow) throw error
      return ok
    })
}

export const useAppStore = create<AppState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  favorites: [],
  wrongBook: {},
  history: [],
  daily: {},
  lastCollectionId: null,
  banks: [],
  banksVersion: 0,
  papers: [],
  pendingSession: null,
  bankSnapshots: [],
  hydration: 'idle',
  hydrationError: null,
  persistenceError: null,

  hydrate: async () => {
    if (get().hydration === 'loading' || get().hydration === 'ready') return
    set({ hydration: 'loading', hydrationError: null })
    try {
      repository = await getRepository()
      const snapshot = await repository.load()
      const migrated = await migrateLegacyStorage(snapshot)
      set({
        ...migrated,
        banksVersion: migrated.banksVersion,
        hydration: 'ready',
      })
    } catch (error) {
      set({
        hydration: 'error',
        hydrationError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  setTheme: (theme) => {
    set((state) => ({ settings: { ...state.settings, theme } }))
    persist((repo) => repo.saveSettings(get().settings))
  },
  toggleTheme: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        theme: state.settings.theme === 'light' ? 'dark' : 'light',
      },
    }))
    persist((repo) => repo.saveSettings(get().settings))
  },
  setFontScale: (fontScale) => {
    set((state) => ({ settings: { ...state.settings, fontScale } }))
    persist((repo) => repo.saveSettings(get().settings))
  },
  setAutoNext: (autoNext) => {
    set((state) => ({ settings: { ...state.settings, autoNext } }))
    persist((repo) => repo.saveSettings(get().settings))
  },
  setShowSampleBanks: (showSampleBanks) => {
    set((state) => ({ settings: { ...state.settings, showSampleBanks } }))
    persist((repo) => repo.saveSettings(get().settings))
  },

  toggleFavorite: (questionId) => {
    const favorite = !get().favorites.includes(questionId)
    set((state) => ({
      favorites: favorite
        ? [...state.favorites, questionId]
        : state.favorites.filter((id) => id !== questionId),
    }))
    persist((repo) => repo.setFavorite(questionId, favorite))
  },
  clearFavorites: () => {
    set({ favorites: [] })
    persist((repo) => repo.clearFavorites())
  },

  recordWrong: (entry) => {
    const existing = get().wrongBook[entry.questionId]
    const next: WrongEntry = {
      ...entry,
      wrongCount: (existing?.wrongCount ?? 0) + 1,
      lastWrongAt: Date.now(),
    }
    set((state) => ({
      wrongBook: { ...state.wrongBook, [entry.questionId]: next },
    }))
    persist((repo) => repo.recordWrong(next))
  },
  removeWrong: (questionId) => {
    set((state) => {
      const next = { ...state.wrongBook }
      delete next[questionId]
      return { wrongBook: next }
    })
    persist((repo) => repo.removeWrong(questionId))
  },
  clearWrongBook: () => {
    set({ wrongBook: {} })
    persist((repo) => repo.clearWrongBook())
  },

  addHistory: (entry) => {
    set((state) => {
      const current = state.daily[entry.dateKey] ?? {
        date: entry.dateKey,
        answered: 0,
        correct: 0,
      }
      return {
        history: [entry, ...state.history].slice(0, 100),
        daily: {
          ...state.daily,
          [entry.dateKey]: {
            ...current,
            answered: current.answered + entry.answered,
            correct: current.correct + entry.correct,
          },
        },
      }
    })
    persist((repo) => repo.addHistory(entry))
  },
  clearHistory: () => {
    set({ history: [], daily: {} })
    persist((repo) => repo.clearHistory())
  },

  setLastCollection: (collectionId) => {
    set({ lastCollectionId: collectionId })
    persist((repo) => repo.setLastCollection(collectionId))
  },

  savePendingSession: (session) => {
    set({ pendingSession: session })
    persist((repo) => repo.setPendingSession(session))
  },

  clearPendingSession: () => {
    set({ pendingSession: null })
    persist((repo) => repo.setPendingSession(null))
  },

  archiveBankVersion: (bank) => {
    const savedAt = Date.now()
    const sameBank = get().bankSnapshots.filter((item) => item.bankId === bank.id)
    const revision = sameBank.length === 0 ? 1 : Math.max(...sameBank.map((item) => item.revision)) + 1
    // ID 用 revision 而不是时间戳：同一毫秒内的两次存档（改完立刻点保存、
    // 或回滚时先存档再写入）时间戳相同，用时间戳会让后一份覆盖前一份。
    // revision 在同一题库内单调递增，天然唯一。
    const snapshot: BankSnapshot = {
      id: `${bank.id}:r${revision}`,
      bankId: bank.id,
      savedAt,
      revision,
      // 深拷贝：后续编辑会生成新对象，但题目数组可能被复用，不拷贝会串改历史。
      bank: structuredClone(bank),
    }
    set((state) => {
      const others = state.bankSnapshots.filter((item) => item.bankId !== bank.id)
      const kept = [...state.bankSnapshots.filter((item) => item.bankId === bank.id), snapshot]
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, BANK_SNAPSHOT_LIMIT)
      return { bankSnapshots: [...others, ...kept] }
    })
    persist((repo) => repo.addBankSnapshot(snapshot))
    return snapshot
  },

  rollbackBankVersion: async (snapshotId) => {
    const snapshot = get().bankSnapshots.find((item) => item.id === snapshotId)
    if (!snapshot) return
    const current = get().banks.find((item) => item.id === snapshot.bankId)
    // 先把当前版本存档：回滚本身也是一次「覆盖」，用户可能滚错了还要回来。
    if (current) get().archiveBankVersion(current)
    await get().addBank(structuredClone(snapshot.bank))
    set((state) => ({
      bankSnapshots: state.bankSnapshots.filter((item) => item.id !== snapshotId),
    }))
    persist((repo) => repo.removeBankSnapshot(snapshotId))
  },

  removeBankSnapshot: (snapshotId) => {
    set((state) => ({
      bankSnapshots: state.bankSnapshots.filter((item) => item.id !== snapshotId),
    }))
    persist((repo) => repo.removeBankSnapshot(snapshotId))
  },

  addBank: (bank) => {
    set((state) => ({
      banks: [...state.banks.filter((item) => item.id !== bank.id), bank],
      banksVersion: state.banksVersion + 1,
    }))
    return persist((repo) => repo.upsertBank(bank), { rethrow: true })
  },

  removeBank: (bankId) => {
    set((state) => {
      // 题库删了，指向它的错题与收藏必须一起清，否则设置页的计数
      // 会把数据库里已无对应的孤儿记录也算进去，越攒越多。
      const wrongBook = { ...state.wrongBook }
      for (const entry of Object.values(wrongBook)) {
        if (entry.collectionId === bankId) delete wrongBook[entry.questionId]
      }
      const prefix = `${bankId}-`
      const favorites = state.favorites.filter((id) => !id.startsWith(prefix))
      return {
        banks: state.banks.filter((item) => item.id !== bankId),
        wrongBook,
        favorites,
        banksVersion: state.banksVersion + 1,
      }
    })
    persist((repo) => repo.deleteBank(bankId))
    // 题库没了，它的历史版本也没有意义，留着只占空间。
    set((state) => ({
      bankSnapshots: state.bankSnapshots.filter((item) => item.bankId !== bankId),
    }))
    persist((repo) => repo.clearBankSnapshots(bankId))
  },

  addPaper: (paper) => {
    set((state) => ({
      papers: [paper, ...state.papers.filter((item) => item.id !== paper.id)].slice(0, 20),
    }))
    persist((repo) => repo.addPaper(paper))
  },

  removePaper: (paperId) => {
    set((state) => ({ papers: state.papers.filter((item) => item.id !== paperId) }))
    persist((repo) => repo.removePaper(paperId))
  },

  resetProgress: () => {
    set({
      favorites: [],
      wrongBook: {},
      history: [],
      daily: {},
      lastCollectionId: null,
      // 重置学习数据也要丢掉半截会话：否则「继续上次」会带用户回到
      // 一个已经被清空进度的练习里。
      pendingSession: null,
    })
    persist((repo) => repo.resetProgress())
  },

  restoreBackup: (data) => {
    set((state) => ({
      settings: { ...state.settings, ...data.settings },
      favorites: data.favorites,
      wrongBook: data.wrongBook,
      history: data.history,
      daily: data.daily,
      banks: data.banks,
      banksVersion: state.banksVersion + 1,
      papers: data.papers,
      lastCollectionId: null,
      pendingSession: null,
    }))
    const next: DataSnapshot = {
      settings: { ...get().settings, ...data.settings },
      favorites: data.favorites,
      wrongBook: data.wrongBook,
      history: data.history,
      daily: data.daily,
      lastCollectionId: null,
      banks: data.banks,
      papers: data.papers,
      pendingSession: null,
      // 备份恢复保留本机已有的历史版本：它们是本机资产，与备份内容无关。
      bankSnapshots: get().bankSnapshots,
    }
    return persist((repo) => repo.replaceAll(next), { rethrow: true })
  },
}))

/**
 * 一次性迁移：旧版本把整个状态存在 localStorage 里。
 *
 * 只在数据库为空时执行，避免覆盖用户已经产生的新数据；
 * 迁移成功后删除旧键，防止重复导入。迁移失败则保留旧键，用户仍有原始数据。
 */
async function migrateLegacyStorage(
  snapshot: DataSnapshot,
): Promise<DataSnapshot & { banksVersion: number }> {
  const isEmpty =
    snapshot.banks.length === 0 &&
    snapshot.history.length === 0 &&
    snapshot.favorites.length === 0 &&
    snapshot.papers.length === 0 &&
    Object.keys(snapshot.wrongBook).length === 0

  if (!isEmpty || !repository) return { ...snapshot, banksVersion: 0 }

  const raw = resilientStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return { ...snapshot, banksVersion: 0 }

  try {
    const parsed = JSON.parse(raw) as { state?: Partial<DataSnapshot>; version?: number }
    const legacy = parsed.state
    if (!legacy) return { ...snapshot, banksVersion: 0 }

    const merged: DataSnapshot = {
      settings: { ...DEFAULT_SETTINGS, ...(legacy.settings ?? {}) },
      favorites: legacy.favorites ?? [],
      wrongBook: legacy.wrongBook ?? {},
      history: legacy.history ?? [],
      daily: legacy.daily ?? {},
      lastCollectionId: legacy.lastCollectionId ?? null,
      banks: legacy.banks ?? [],
      papers: legacy.papers ?? [],
      // 旧版没有会话续做，迁移时一律视为没有未完成会话。
      pendingSession: null,
      bankSnapshots: [],
    }
    await repository.replaceAll(merged)
    resilientStorage.removeItem(LEGACY_STORAGE_KEY)
    return { ...merged, banksVersion: 1 }
  } catch {
    return { ...snapshot, banksVersion: 0 }
  }
}

/** 仅供测试：注入假仓储并重置内存状态。 */
export function attachRepositoryForTest(repo: Repository | null): void {
  repository = repo
  setRepositoryForTest(repo)
}

export function resetStoreForTest(): void {
  repository = null
  setRepositoryForTest(null)
  useAppStore.setState({ ...emptySnapshot(), banksVersion: 0, hydration: 'idle' })
}
