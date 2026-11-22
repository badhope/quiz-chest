import type { QuestionSeed } from './types'

/** 判分模式，与 `src/lib/quiz.ts` 的 SessionMode 保持同源。 */
export type RecordMode = 'practice' | 'exam' | 'review'

/**
 * 数据记录类型。
 *
 * 这些类型同时是三层的数据契约：SQLite 表结构（`src-tauri/src/db.rs`）、
 * IndexedDB 对象仓库（`src/services/repository.ts`）与前端状态
 * （`src/store/useAppStore.ts`）。任何一层改字段，其余两层必须同步。
 *
 * 所有时间戳均为毫秒级 epoch，所有 ID 均为字符串，避免跨端序列化差异。
 */

export interface ImportedBank {
  id: string
  title: string
  subtitle: string
  description: string
  exam: string
  icon: string
  accent: string
  level: '入门' | '进阶' | '挑战'
  durationMin: number
  tags: string[]
  importedAt: number
  questions: QuestionSeed[]
}

export interface WrongEntry {
  questionId: string
  collectionId: string
  wrongCount: number
  lastWrongAt: number
  lastSelection: number[]
}

export interface HistoryEntry {
  id: string
  mode: RecordMode
  collectionId: string
  collectionTitle: string
  domainId?: string
  answered: number
  correct: number
  wrong: number
  skipped: number
  total: number
  accuracy: number
  durationSec: number
  finishedAt: number
  dateKey: string
}

export interface PaperRecord {
  id: string
  title: string
  collectionIds: string[]
  count: number
  durationMin: number
  order: 'random' | 'sequence'
  createdAt: number
}

export interface DailyStat {
  date: string
  answered: number
  correct: number
}

export interface AppSettings {
  theme: 'light' | 'dark'
  fontScale: 'normal' | 'large'
  autoNext: boolean
  showSampleBanks: boolean
}

/** 数据库中的完整状态，用于启动加载与整库替换。 */
/**
 * 未做完的练习会话。
 *
 * 为什么必须持久化到数据库而不是内存/sessionStorage：用户常在手机上做半套题
 * 就切走，系统可能随时回收进程；只在内存里等于「离开就重来」，
 * 这是刷题类应用最伤人的体验缺陷。
 *
 * 只存一份：同一时间只保留最近一次未完成的会话，开始新练习会覆盖它。
 * 完成的会话走 HistoryEntry，不在这里留痕。
 */
export interface PendingSession {
  /** 由调用方生成，用于区分「同一次会话」的多次保存。 */
  id: string
  mode: 'practice' | 'exam' | 'review'
  collectionId: string
  collectionTitle: string
  domainId?: string
  /** 冻结的题序（题目 ID），保证续做时顺序与离开前一致。 */
  questionIds: string[]
  answers: Record<string, number[]>
  /** 已核对（查看过解析）的题目 ID；练习模式下用于恢复「已提交」状态。 */
  checkedIds: string[]
  index: number
  startedAt: number
  /** 考试模式的剩余秒数；练习模式为 null。 */
  remainingSec: number | null
  /** 自定义组卷的卷名等额外信息。 */
  title: string
}

/**
 * 题库的历史版本。
 *
 * 只存「被覆盖掉的旧版本」，不存当前版本——当前版本就是 banks 里的那份，
 * 再存一遍纯属冗余。编辑题库时把旧内容压进这里，用户可回滚。
 *
 * 体积控制：快照含完整题目，体积随题库大小线性增长。每库最多保留
 * 最近 N 份（见 BANK_SNAPSHOT_LIMIT），超出按时间淘汰最旧的。
 */
export interface BankSnapshot {
  /** `{bankId}:{savedAt}`，同一毫秒同一库不会重复。 */
  id: string
  bankId: string
  /** 存档时间（= 被替换前那份内容的「最后修改时间」上限）。 */
  savedAt: number
  /** 这次存档对应的版本序号，从 1 递增，方便界面显示。 */
  revision: number
  /** 存档时的完整题库内容。 */
  bank: ImportedBank
}

export interface DataSnapshot {
  settings: AppSettings
  favorites: string[]
  wrongBook: Record<string, WrongEntry>
  history: HistoryEntry[]
  daily: Record<string, DailyStat>
  lastCollectionId: string | null
  banks: ImportedBank[]
  papers: PaperRecord[]
  /** 未完成的会话；null 表示没有。 */
  pendingSession: PendingSession | null
  /** 题库历史版本，按 bankId 分组保存在一张表里。 */
  bankSnapshots: BankSnapshot[]
}
