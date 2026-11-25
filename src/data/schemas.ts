import * as v from 'valibot'
import { DEFAULT_TUTOR_ENDPOINT, DEFAULT_TUTOR_MODEL } from '../lib/tutor/config'

/**
 * 持久化数据的结构 schema 单一来源。
 *
 * 备份恢复、题库包导入、未来的数据校验都必须共用这套定义。以前备份里
 * 一份 BankSchema，题库包只有 `Array.isArray(questions)` 的浅检查，
 * 坏字段能绕过校验直接进渲染层。这里只约束“形状”，业务规则（选项数量、
 * 解析长度、答案合法性）仍由 importer 逐行校验，保证错误能定位到行号。
 */
export const QuestionSchema = v.object({
  type: v.picklist(['single', 'multiple', 'judge', 'fill', 'short']),
  stem: v.string(),
  options: v.array(v.string()),
  answer: v.array(v.number()),
  answerText: v.optional(v.array(v.string())),
  keywords: v.optional(v.array(v.string())),
  explanation: v.string(),
  difficulty: v.picklist([1, 2, 3]),
  tags: v.optional(v.array(v.string()), []),
  image: v.optional(v.string()),
  optionImages: v.optional(v.array(v.string())),
})

export const BankContentSchema = v.object({
  title: v.string(),
  subtitle: v.optional(v.string(), ''),
  description: v.optional(v.string(), ''),
  exam: v.optional(v.string(), ''),
  icon: v.optional(v.string(), 'book'),
  accent: v.optional(v.string(), '#315B7D'),
  level: v.optional(v.picklist(['入门', '进阶', '挑战']), '入门'),
  durationMin: v.optional(v.number(), 10),
  tags: v.optional(v.array(v.string()), []),
  questions: v.array(QuestionSchema),
})

export const StoredBankSchema = v.object({
  ...BankContentSchema.entries,
  id: v.string(),
  importedAt: v.number(),
  domainId: v.optional(v.string()),
  trackId: v.optional(v.string()),
  trackName: v.optional(v.string()),
})

export const ReviewSchema = v.object({
  due: v.number(),
  stability: v.number(),
  difficulty: v.number(),
  scheduledDays: v.number(),
  learningSteps: v.number(),
  reps: v.number(),
  lapses: v.number(),
  state: v.picklist([0, 1, 2, 3]),
  lastReview: v.nullable(v.number()),
})

export const WrongSchema = v.object({
  questionId: v.string(),
  collectionId: v.string(),
  wrongCount: v.number(),
  lastWrongAt: v.number(),
  lastSelection: v.array(v.number()),
  lastText: v.optional(v.string()),
  fsrs: v.optional(ReviewSchema),
  reason: v.optional(v.picklist(['concept', 'method', 'careless', 'time'])),
  note: v.optional(v.string()),
})

export const HistorySchema = v.object({
  id: v.string(),
  mode: v.picklist(['practice', 'exam', 'review']),
  collectionId: v.string(),
  collectionTitle: v.string(),
  domainId: v.optional(v.string()),
  answered: v.number(),
  correct: v.number(),
  wrong: v.number(),
  skipped: v.number(),
  total: v.number(),
  accuracy: v.number(),
  durationSec: v.number(),
  finishedAt: v.number(),
  dateKey: v.string(),
})

export const DailySchema = v.object({
  date: v.string(),
  answered: v.number(),
  correct: v.number(),
})

export const PaperSchema = v.object({
  id: v.string(),
  title: v.string(),
  collectionIds: v.array(v.string()),
  count: v.number(),
  durationMin: v.number(),
  order: v.picklist(['random', 'sequence']),
  createdAt: v.number(),
})

export const SettingsSchema = v.object({
  theme: v.picklist(['light', 'dark']),
  fontScale: v.picklist(['normal', 'large']),
  autoNext: v.boolean(),
  showSampleBanks: v.boolean(),
  allowRemoteImages: v.optional(v.boolean(), false),
  tutor: v.optional(
    v.object({
      enabled: v.optional(v.boolean(), false),
      endpoint: v.optional(v.string(), DEFAULT_TUTOR_ENDPOINT),
      model: v.optional(v.string(), DEFAULT_TUTOR_MODEL),
    }),
  ),
})

export type BankContent = v.InferOutput<typeof BankContentSchema>
