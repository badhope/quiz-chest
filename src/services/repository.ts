import type {
  AppSettings,
  DataSnapshot,
  DailyStat,
  HistoryEntry,
  BankSnapshot,
  ImportedBank,
  PaperRecord,
  PendingSession,
  WrongEntry,
} from '../data/records'

/**
 * 应用内数据层。
 *
 * 目标：把「持久化」从 localStorage 升级为设备内数据库，同时让 Web、
 * 桌面（Tauri）与 Android（Capacitor WebView）共用同一套调用接口。
 *
 * 三种实现：
 *   - `sqlite`     Tauri 桌面端，Rust `rusqlite` 命令（`src-tauri/src/db.rs`）
 *   - `indexeddb`  Web / PWA / Android WebView，浏览器原生数据库
 *   - `memory`     测试与极端降级，进程内 Map
 *
 * 约定：所有方法返回 Promise，写操作落库失败必须抛出，由调用方决定提示方式；
 * 不允许静默吞掉写入错误，否则用户会以为数据已保存。
 */

export type DriverName = 'sqlite' | 'indexeddb' | 'memory'

export interface Repository {
  readonly driver: DriverName
  /** 数据库实际位置，用于设置页展示与问题排查。 */
  readonly location: string
  load(): Promise<DataSnapshot>
  saveSettings(settings: AppSettings): Promise<void>
  setLastCollection(collectionId: string | null): Promise<void>
  /** 保存/清除未完成会话。传 null 表示清除（完成或放弃时调用）。 */
  setPendingSession(session: PendingSession | null): Promise<void>
  /**
   * 追加一份题库历史版本，并按上限淘汰同一题库的旧快照。
   * 传整库快照（含题目），因此上限必须在实现里强制，否则会无限增长。
   */
  addBankSnapshot(snapshot: BankSnapshot): Promise<void>
  /** 删除某份快照（回滚后清理或用户手动删除）。 */
  removeBankSnapshot(snapshotId: string): Promise<void>
  /** 清空某个题库的全部历史（删除题库时调用）。 */
  clearBankSnapshots(bankId: string): Promise<void>
  /**
   * 清空学习数据（收藏/错题/记录/统计/未完成会话），保留题库与设置。
   * 实现必须把 pendingSession 也清掉，否则「继续上次」会指向已清空的练习。
   */
  setFavorite(questionId: string, favorite: boolean): Promise<void>
  clearFavorites(): Promise<void>
  /**
   * 整条写入错题记录（调用方已算好累计次数）。
   *
   * 刻意不提供「在数据库里自增」的变体：本应用只有一个本地写入者，
   * 自增放在 store 里能保证界面与数据库看到同一个数字；若两边各算一次，
   * 失败重试或多端写入时会翻倍。
   */
  recordWrong(entry: WrongEntry): Promise<void>
  removeWrong(questionId: string): Promise<void>
  clearWrongBook(): Promise<void>
  addHistory(entry: HistoryEntry): Promise<void>
  clearHistory(): Promise<void>
  upsertBank(bank: ImportedBank): Promise<void>
  deleteBank(bankId: string): Promise<void>
  addPaper(paper: PaperRecord): Promise<void>
  removePaper(paperId: string): Promise<void>
  resetProgress(): Promise<void>
  replaceAll(snapshot: DataSnapshot): Promise<void>
  close(): Promise<void>
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontScale: 'normal',
  autoNext: false,
  showSampleBanks: true,
}

export function emptySnapshot(): DataSnapshot {
  return {
    settings: { ...DEFAULT_SETTINGS },
    favorites: [],
    wrongBook: {},
    history: [],
    daily: {},
    lastCollectionId: null,
    banks: [],
    papers: [],
    pendingSession: null,
    bankSnapshots: [],
  }
}

export function toWrongBook(entries: WrongEntry[]): Record<string, WrongEntry> {
  return Object.fromEntries(entries.map((entry) => [entry.questionId, entry]))
}

export function toDaily(entries: DailyStat[]): Record<string, DailyStat> {
  return Object.fromEntries(entries.map((entry) => [entry.date, entry]))
}

/** 后端以数组传输，前端以 Record 索引；统一在仓储层做形状转换。 */
export interface RawSnapshot {
  settings: AppSettings
  favorites: string[]
  wrongBook: WrongEntry[]
  history: HistoryEntry[]
  daily: DailyStat[]
  lastCollectionId: string | null
  banks: ImportedBank[]
  papers: PaperRecord[]
  pendingSession: PendingSession | null
  bankSnapshots: BankSnapshot[]
}

export function normalizeSnapshot(raw: RawSnapshot): DataSnapshot {
  return {
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    favorites: raw.favorites ?? [],
    wrongBook: toWrongBook(raw.wrongBook ?? []),
    history: raw.history ?? [],
    daily: toDaily(raw.daily ?? []),
    lastCollectionId: raw.lastCollectionId ?? null,
    banks: raw.banks ?? [],
    papers: raw.papers ?? [],
    pendingSession: raw.pendingSession ?? null,
    bankSnapshots: raw.bankSnapshots ?? [],
  }
}

export function snapshotToRaw(snapshot: DataSnapshot): RawSnapshot {
  return {
    settings: snapshot.settings,
    favorites: snapshot.favorites,
    wrongBook: Object.values(snapshot.wrongBook),
    history: snapshot.history,
    daily: Object.values(snapshot.daily),
    lastCollectionId: snapshot.lastCollectionId,
    banks: snapshot.banks,
    papers: snapshot.papers,
    pendingSession: snapshot.pendingSession,
    bankSnapshots: snapshot.bankSnapshots,
  }
}
