import type { DomainId, QuestionSeed } from './types'

// FSRS 卡片状态。全部用数字和时间戳，别塞 Date：这结构要过 JSON、
// SQLite、IndexedDB 三层，Date 跨层会变字符串，形状就对不上。
export interface ReviewState {
  /** 下次到期时间（epoch ms）。 */
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  /** 0=新卡 1=学习中 2=复习 3=重学。 */
  state: number
  /** 上次复习时间；新卡为 null。 */
  lastReview: number | null
}

/** 判分模式，与 `src/lib/quiz.ts` 的 SessionMode 保持同源。 */
export type RecordMode = 'practice' | 'exam' | 'review'

// 这些类型同时是 SQLite 表、IndexedDB 对象仓库和前端 store 的契约。
// 任何一层加字段，另外两层要一起改；时间统一用毫秒时间戳。

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
  // 导入时挂到哪个领域；不填就落在「我的题库」。有它目录树和薄弱项统计
  // 才能把这批题当一等公民，而不是一个扁平垃圾桶。
  domainId?: DomainId
  /** 用户自定义的学段/分组；同一 trackId 的题库在目录里会归到一组。 */
  trackId?: string
  trackName?: string
  questions: QuestionSeed[]
}

export interface WrongEntry {
  questionId: string
  collectionId: string
  wrongCount: number
  lastWrongAt: number
  lastSelection: number[]
  /** FSRS 复习状态；旧数据没有这个字段时按「今天到期」处理。 */
  fsrs?: ReviewState
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
  // 外链图默认关：应用对外说数据不出本机，但 http 图片会把 IP/Referer 送出去。
  // 用户要在设置里自己打开；data:image 不受影响。
  allowRemoteImages: boolean
}

// 未完成会话只留一份，开始新练习会覆盖旧的。手机切后台随时可能被系统杀，
// 存内存等于「离开就重来」，所以必须落库。
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

// 只存被覆盖掉的旧版本，当前版本仍在 banks 里。快照含完整题目，
// 每库限保留最近几份（BANK_SNAPSHOT_LIMIT），否则大题库会把库撑爆。
export interface BankSnapshot {
  /** `${bankId}:r${revision}`。以前用过时间戳，同一毫秒连点两次会撞 ID。 */
  id: string
  bankId: string
  /** 存档时间（= 被替换前那份内容的「最后修改时间」上限）。 */
  savedAt: number
  /** 这次存档对应的版本序号，从 1 递增，方便界面显示。 */
  revision: number
  /** 存档时的完整题库内容。 */
  bank: ImportedBank
}

// 启动加载和整库替换都用这份完整状态；字段增删要同时改三层实现。
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
