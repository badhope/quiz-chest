import { create } from 'zustand'
import type {
  AppSettings,
  DataSnapshot,
  DailyStat,
  HistoryEntry,
  ImportedBank,
  BankSnapshot,
  ErrorReason,
  PaperRecord,
  PendingSession,
  WrongEntry,
} from '../data/records'
import { DEFAULT_SETTINGS, emptySnapshot } from '../services/repository'
import { getRepository, setRepositoryForTest } from '../services/dataLayer'
import type { Repository } from '../services/repository'
import { nextBankSnapshots } from '../services/snapshotPolicy'
import { gradeReview } from '../lib/review'
import { mergeHistoryEntry } from '../lib/history'

export type {
  AppSettings,
  DailyStat,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  WrongEntry,
}

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
  updateSettings: (patch: Partial<AppSettings>) => void
  setTheme: (theme: AppSettings['theme']) => void
  toggleTheme: () => void
  setFontScale: (scale: AppSettings['fontScale']) => void
  setAutoNext: (value: boolean) => void
  setShowSampleBanks: (value: boolean) => void
  setAllowRemoteImages: (value: boolean) => void
  toggleFavorite: (questionId: string) => void
  /** 破坏性清空：先落库成功再清内存，失败返回 false。 */
  clearFavorites: () => Promise<boolean>
  recordWrong: (entry: Omit<WrongEntry, 'wrongCount' | 'lastWrongAt' | 'fsrs' | 'reason' | 'note'>) => void
  /** 手动标注错因/笔记；reason 传 null 表示清除。 */
  updateWrongMeta: (questionId: string, patch: { reason?: ErrorReason | null; note?: string }) => void
  /** 复习答对：按 FSRS 延后到期时间，不直接把题移出错题本。 */
  gradeCorrect: (questionId: string) => void
  removeWrong: (questionId: string) => void
  /** 破坏性清空：先落库成功再清内存，失败返回 false。 */
  clearWrongBook: () => Promise<boolean>
  addHistory: (entry: HistoryEntry) => void
  /** 破坏性清空：先落库成功再清内存，失败返回 false。 */
  clearHistory: () => Promise<boolean>
  setLastCollection: (collectionId: string) => void
  savePendingSession: (session: PendingSession) => void
  clearPendingSession: () => void
  /** 编辑题库前把旧版本压进历史；返回新建的快照（含 revision）。 */
  archiveBankVersion: (bank: ImportedBank) => BankSnapshot | null
  /** 回滚到某个历史版本：当前版本会先被存档，不会丢。 */
  rollbackBankVersion: (snapshotId: string) => Promise<void>
  removeBankSnapshot: (snapshotId: string) => void
  // 需要用户看到保存结果的操作显式 await；其余写操作只记 persistenceError。
  addBank: (bank: ImportedBank) => Promise<boolean>
  /** 删除题库及其关联数据：先落库成功再清内存，失败返回 false。 */
  removeBank: (bankId: string) => Promise<boolean>
  addPaper: (paper: PaperRecord) => void
  removePaper: (paperId: string) => void
  /**
   * 重置学习数据：先落库再清内存，失败时界面必须保持原样。
   * 返回 Promise 且失败会 reject，调用方要 await 后提示。
   */
  resetProgress: () => Promise<void>
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

/** 按操作键保存失败的写任务；同键新任务覆盖旧任务，避免重复堆积。 */
type PersistTask = (repo: Repository) => Promise<void>
const failedWrites = new Map<string, PersistTask>()
let retryInFlight: Promise<boolean> | null = null

export function hasPendingWrites(): boolean {
  return failedWrites.size > 0
}

/**
 * 重试所有失败的写操作。按进入队列的顺序执行；某个任务仍失败就停下，
 * 剩下的任务继续留在队列里，等下一次重试。
 */
export function retryPendingWrites(): Promise<boolean> {
  // 用户连点或提示条与其他入口同时触发时，只跑一轮；
  // 否则同一批任务可能被并发重放两遍。
  if (retryInFlight) return retryInFlight
  retryInFlight = runPendingWrites().finally(() => {
    retryInFlight = null
  })
  return retryInFlight
}

async function runPendingWrites(): Promise<boolean> {
  if (!repository) {
    useAppStore.setState({ persistenceError: '数据层尚未就绪，无法重试' })
    return false
  }
  const entries = [...failedWrites.entries()]
  for (const [key, task] of entries) {
    if (failedWrites.get(key) !== task) continue
    try {
      await task(repository)
      if (failedWrites.get(key) === task) failedWrites.delete(key)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      useAppStore.setState({ persistenceError: message })
      return false
    }
  }
  if (failedWrites.size === 0) useAppStore.setState({ persistenceError: null })
  return failedWrites.size === 0
}

// 写操作统一走这里：先改内存，界面立刻有反馈；落库异步补。
// 默认不 reject，否则收藏、改主题这些即发即忘的调用会刷一屏
// Uncaught (in promise)。编辑器、恢复备份要明确报错，传 rethrow。
type PersistOptions = { rethrow?: boolean; retryKey?: string }

function persist(
  task: PersistTask,
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
    .then(() => {
      if (options.retryKey) failedWrites.delete(options.retryKey)
      if (failedWrites.size === 0) useAppStore.setState({ persistenceError: null })
      return true
    })
    .catch((error: unknown) => {
      // 只留下带键的任务：备份恢复这类整库替换不能自动重放，
      // 重试时内存状态和数据库必须由用户重新确认。
      if (options.retryKey) failedWrites.set(options.retryKey, task)
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
      set({
        ...snapshot,
        banksVersion: 0,
        hydration: 'ready',
      })
    } catch (error) {
      set({
        hydration: 'error',
        hydrationError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    persist((repo) => repo.saveSettings(next), { retryKey: 'settings' })
  },
  setTheme: (theme) => get().updateSettings({ theme }),
  toggleTheme: () => {
    get().updateSettings({ theme: get().settings.theme === 'light' ? 'dark' : 'light' })
  },
  setFontScale: (fontScale) => get().updateSettings({ fontScale }),
  setAutoNext: (autoNext) => get().updateSettings({ autoNext }),
  setShowSampleBanks: (showSampleBanks) => get().updateSettings({ showSampleBanks }),
  setAllowRemoteImages: (allowRemoteImages) => get().updateSettings({ allowRemoteImages }),

  toggleFavorite: (questionId) => {
    const favorite = !get().favorites.includes(questionId)
    set((state) => ({
      favorites: favorite
        ? [...state.favorites, questionId]
        : state.favorites.filter((id) => id !== questionId),
    }))
    persist((repo) => repo.setFavorite(questionId, favorite), {
      retryKey: `favorite:${questionId}`,
    })
  },
  clearFavorites: async () => {
    const ok = await persist((repo) => repo.clearFavorites())
    if (!ok) return false
    set({ favorites: [] })
    return true
  },

  recordWrong: (entry) => {
    const existing = get().wrongBook[entry.questionId]
    const now = Date.now()
    const next: WrongEntry = {
      ...existing,
      ...entry,
      wrongCount: (existing?.wrongCount ?? 0) + 1,
      lastWrongAt: now,
      // 答错按 Again 处理；旧数据没有 fsrs 时由 gradeReview 新建一张卡。
      fsrs: gradeReview(existing?.fsrs, 'again', now),
    }
    set((state) => ({
      wrongBook: { ...state.wrongBook, [entry.questionId]: next },
    }))
    persist((repo) => repo.recordWrong(next), { retryKey: `wrong:${next.questionId}` })
  },
  updateWrongMeta: (questionId, patch) => {
    const existing = get().wrongBook[questionId]
    if (!existing) return
    const next: WrongEntry = { ...existing }
    if ('reason' in patch) {
      if (patch.reason) next.reason = patch.reason
      else delete next.reason
    }
    if ('note' in patch) {
      const note = patch.note?.trim()
      if (note) next.note = note.slice(0, 200)
      else delete next.note
    }
    set((state) => ({ wrongBook: { ...state.wrongBook, [questionId]: next } }))
    persist((repo) => repo.recordWrong(next), { retryKey: `wrong:${questionId}` })
  },
  gradeCorrect: (questionId) => {
    const existing = get().wrongBook[questionId]
    if (!existing) return
    const now = Date.now()
    const next: WrongEntry = { ...existing, fsrs: gradeReview(existing.fsrs, 'good', now) }
    set((state) => ({ wrongBook: { ...state.wrongBook, [questionId]: next } }))
    persist((repo) => repo.recordWrong(next), { retryKey: `wrong:${next.questionId}` })
  },

  removeWrong: (questionId) => {
    set((state) => {
      const next = { ...state.wrongBook }
      delete next[questionId]
      return { wrongBook: next }
    })
    persist((repo) => repo.removeWrong(questionId), { retryKey: `wrong:${questionId}` })
  },
  clearWrongBook: async () => {
    const ok = await persist((repo) => repo.clearWrongBook())
    if (!ok) return false
    set({ wrongBook: {} })
    return true
  },

  addHistory: (entry) => {
    set((state) => mergeHistoryEntry(state.history, state.daily, entry))
    persist((repo) => repo.addHistory(entry), { retryKey: `history:${entry.id}` })
  },
  clearHistory: async () => {
    const ok = await persist((repo) => repo.clearHistory())
    if (!ok) return false
    set({ history: [], daily: {} })
    return true
  },

  setLastCollection: (collectionId) => {
    set({ lastCollectionId: collectionId })
    persist((repo) => repo.setLastCollection(collectionId), { retryKey: 'lastCollection' })
  },

  savePendingSession: (session) => {
    set({ pendingSession: session })
    persist((repo) => repo.setPendingSession(session), { retryKey: 'pendingSession' })
  },

  clearPendingSession: () => {
    set({ pendingSession: null })
    persist((repo) => repo.setPendingSession(null), { retryKey: 'pendingSession' })
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
    set((state) => ({
      bankSnapshots: nextBankSnapshots(state.bankSnapshots, snapshot),
    }))
    persist((repo) => repo.addBankSnapshot(snapshot), { retryKey: `snapshot:${snapshot.id}` })
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
    persist((repo) => repo.removeBankSnapshot(snapshotId), { retryKey: `snapshot:${snapshotId}` })
  },

  removeBankSnapshot: (snapshotId) => {
    set((state) => ({
      bankSnapshots: state.bankSnapshots.filter((item) => item.id !== snapshotId),
    }))
    persist((repo) => repo.removeBankSnapshot(snapshotId), { retryKey: `snapshot:${snapshotId}` })
  },

  addBank: (bank) => {
    set((state) => ({
      banks: [...state.banks.filter((item) => item.id !== bank.id), bank],
      banksVersion: state.banksVersion + 1,
    }))
    return persist((repo) => repo.upsertBank(bank), {
      rethrow: true,
      retryKey: `bank:${bank.id}`,
    })
  },

  removeBank: async (bankId) => {
    // 删除题库是不可撤销操作：数据库里的题库、错题、收藏、历史版本
    // 必须一起成功；失败时界面保持原样，不能先消失再等重试。
    const ok = await persist((repo) => repo.deleteBank(bankId))
    if (!ok) return false
    set((state) => {
      // deleteBank 已级联清理数据库里的错题、收藏与快照，这里同步内存。
      const wrongBook = { ...state.wrongBook }
      for (const entry of Object.values(wrongBook)) {
        if (entry.collectionId === bankId) delete wrongBook[entry.questionId]
      }
      const prefix = `${bankId}-`
      return {
        banks: state.banks.filter((item) => item.id !== bankId),
        wrongBook,
        favorites: state.favorites.filter((id) => !id.startsWith(prefix)),
        bankSnapshots: state.bankSnapshots.filter((item) => item.bankId !== bankId),
        banksVersion: state.banksVersion + 1,
      }
    })
    return true
  },

  addPaper: (paper) => {
    set((state) => ({
      papers: [paper, ...state.papers.filter((item) => item.id !== paper.id)].slice(0, 20),
    }))
    persist((repo) => repo.addPaper(paper), { retryKey: `paper:${paper.id}` })
  },

  removePaper: (paperId) => {
    set((state) => ({ papers: state.papers.filter((item) => item.id !== paperId) }))
    persist((repo) => repo.removePaper(paperId), { retryKey: `paper:${paperId}` })
  },

  resetProgress: async () => {
    // 重置是不可撤销的破坏性操作，不能先清界面再异步落库：
    // 否则失败时用户看到的「已清空」只是假象，重开应用数据全回来。
    // 和备份恢复一样先 await 落库，成功后才改内存。
    await persist((repo) => repo.resetProgress(), { rethrow: true })
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
  },

  restoreBackup: async (data) => {
    const state = get()
    const next: DataSnapshot = {
      settings: { ...state.settings, ...data.settings },
      favorites: data.favorites,
      wrongBook: data.wrongBook,
      history: data.history,
      daily: data.daily,
      lastCollectionId: null,
      banks: data.banks,
      papers: data.papers,
      pendingSession: null,
      // 备份恢复保留本机已有的历史版本：它们是本机资产，与备份内容无关。
      bankSnapshots: state.bankSnapshots,
    }
    // 先落库再改内存：replaceAll 失败时界面必须保持原样，
    // 否则设置页显示「原数据未被替换」，而内存里其实已经被覆盖了。
    const ok = await persist((repo) => repo.replaceAll(next), { rethrow: true })
    set({ ...next, banksVersion: state.banksVersion + 1 })
    return ok
  },
}))

/** 仅供测试：注入假仓储并重置内存状态。 */
export function attachRepositoryForTest(repo: Repository | null): void {
  repository = repo
  failedWrites.clear()
  retryInFlight = null
  setRepositoryForTest(repo)
}

export function resetStoreForTest(): void {
  repository = null
  failedWrites.clear()
  retryInFlight = null
  setRepositoryForTest(null)
  useAppStore.setState({ ...emptySnapshot(), banksVersion: 0, hydration: 'idle' })
}
