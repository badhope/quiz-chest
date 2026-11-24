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

// 数据层接口。页面只认这个文件，底下换 SQLite / IndexedDB / 内存都不改调用方。
// 写方法失败必须 throw；吞掉写入错误比慢更糟，用户会以为已经保存了。

export type DriverName = 'sqlite' | 'indexeddb' | 'memory'

/** 历史记录与组卷历史的保留上限。前端三种仓储共用，Rust 侧保持同值。 */
export const HISTORY_LIMIT = 100
export const PAPER_LIMIT = 20

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
  /** 收藏状态按题 ID 单条写。 */
  setFavorite(questionId: string, favorite: boolean): Promise<void>
  clearFavorites(): Promise<void>
  /**
   * 整条写入错题记录。wrongCount 在 store 里算好，仓储不再自增；
   * 否则失败重试一次，数据库里的错误次数会翻倍。
   */
  recordWrong(entry: WrongEntry): Promise<void>
  removeWrong(questionId: string): Promise<void>
  clearWrongBook(): Promise<void>
  addHistory(entry: HistoryEntry): Promise<void>
  clearHistory(): Promise<void>
  upsertBank(bank: ImportedBank): Promise<void>
  /** 删除题库，并级联清理它的错题、收藏前缀与历史版本。 */
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
  allowRemoteImages: false,
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
