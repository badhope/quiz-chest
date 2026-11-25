import * as v from 'valibot'
import type { AppSettings, DailyStat, HistoryEntry, ImportedBank, PaperRecord, WrongEntry } from '../store/useAppStore'
import { dateStamp } from './datetime'
import { downloadBlob, type DownloadResult } from './download'
import {
  DailySchema,
  HistorySchema,
  PaperSchema,
  SettingsSchema,
  StoredBankSchema,
  WrongSchema,
} from '../data/schemas'

// 全量备份。本地数据库没有云同步，换机、卸载、清库前只能靠这个文件。
// 只放数据，不带 token/路径；format/version 写死，升级时按版本迁移。

export const BACKUP_FORMAT = 'tixing-backup'
export const BACKUP_VERSION = 2

export interface BackupPayload {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  appVersion: string
  data: {
    settings: AppSettings
    favorites: string[]
    wrongBook: Record<string, WrongEntry>
    history: HistoryEntry[]
    daily: Record<string, DailyStat>
    banks: ImportedBank[]
    papers: PaperRecord[]
  }
}

export interface BackupParseResult {
  payload: BackupPayload | null
  error: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildBackup(input: {
  appVersion: string
  settings: AppSettings
  favorites: string[]
  wrongBook: Record<string, WrongEntry>
  history: HistoryEntry[]
  daily: Record<string, DailyStat>
  banks: ImportedBank[]
  papers: PaperRecord[]
}): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: input.appVersion,
    data: {
      settings: input.settings,
      favorites: input.favorites,
      wrongBook: input.wrongBook,
      history: input.history,
      daily: input.daily,
      banks: input.banks,
      papers: input.papers,
    },
  }
}

/** 把备份包序列化成可下载文本。缩进便于用户自查，代价可忽略。 */
export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2)
}

export function backupFileName(now: Date = new Date()): string {
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  return `tixing-backup-${dateStamp(now.getTime())}-${time}.json`
}

// 备份和题库包共用 schemas.ts。之前只查顶层数组，banks:[null] 能混过去，
// 渲染时才崩；现在坏一份就整包拒绝，不半份导入。
const PayloadSchema = v.object({
  settings: SettingsSchema,
  favorites: v.array(v.string()),
  wrongBook: v.record(v.string(), WrongSchema),
  history: v.array(HistorySchema),
  daily: v.record(v.string(), DailySchema),
  banks: v.array(StoredBankSchema),
  papers: v.array(PaperSchema),
})

const BackupSchema = v.object({
  format: v.literal(BACKUP_FORMAT),
  version: v.number(),
  exportedAt: v.string(),
  appVersion: v.string(),
  data: PayloadSchema,
})

function labelForPath(path: readonly { key?: unknown }[]): string {
  const keys = path.map((item) => String(item.key ?? ''))
  if (keys[0] === 'data') keys.shift()
  const head = keys[0]
  const labels: Record<string, string> = {
    settings: '备份中的设置损坏',
    favorites: '备份中的收藏数据损坏',
    wrongBook: '备份中的错题本损坏',
    history: '备份中的练习记录损坏',
    daily: '备份中的每日统计损坏',
    banks: '备份中的题库数据损坏',
    papers: '备份中的组卷历史损坏',
  }
  return (head && labels[head]) || '备份文件格式不正确'
}

export function parseBackup(raw: string): BackupParseResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { payload: null, error: '文件不是合法的 JSON' }
  }
  if (!isObject(data)) return { payload: null, error: '备份文件格式不正确' }
  if (data.format !== BACKUP_FORMAT) return { payload: null, error: '不是 TiXing 备份文件' }

  const version = typeof data.version === 'number' ? data.version : 0
  if (version > BACKUP_VERSION) {
    return {
      payload: null,
      error: `备份版本 ${version} 高于当前支持的 ${BACKUP_VERSION}，请升级应用后再恢复`,
    }
  }

  const result = v.safeParse(BackupSchema, data)
  if (!result.success) {
    return { payload: null, error: labelForPath(result.issues[0]?.path ?? []) }
  }
  return { payload: result.output as unknown as BackupPayload, error: '' }
}

/** 下载备份文件。与 CSV 导出一致，走统一的下载/原生分享入口。 */
export function downloadBackup(payload: BackupPayload): Promise<DownloadResult> {
  return downloadBlob(
    backupFileName(),
    new Blob([serializeBackup(payload)], { type: 'application/json;charset=utf-8' }),
  )
}
