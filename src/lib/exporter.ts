import type { ImportedBank } from '../store/useAppStore'
import * as v from 'valibot'
import { BankContentSchema } from '../data/schemas'
import type { ImportBankInput } from './importer'
import { dateKey } from './datetime'
import { downloadBlob } from './download'

export const BANK_PACKAGE_FORMAT = 'tixing-bank'
export const BANK_PACKAGE_VERSION = 2
export const BANK_PACKAGE_MIN_VERSION = 1

export interface BankPackageMeta {
  format: typeof BANK_PACKAGE_FORMAT
  version: number
  exportedAt: string
}

export interface ExportPackage extends BankPackageMeta {
  bank: ImportBankInput
}

export interface ParsePackageResult {
  bank: ImportedBank | null
  error: string
  warnings: string[]
  version: number | null
}

export function buildExportPackage(bank: ImportedBank): ExportPackage {
  return {
    format: BANK_PACKAGE_FORMAT,
    version: BANK_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    bank: {
      title: bank.title,
      subtitle: bank.subtitle,
      description: bank.description,
      exam: bank.exam,
      icon: bank.icon,
      accent: bank.accent,
      level: bank.level,
      durationMin: bank.durationMin,
      tags: bank.tags,
      questions: bank.questions,
    },
  }
}

export function exportFileName(bank: ImportedBank): string {
  const slug = bank.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
  // dateKey 是本地时区；toISOString 是 UTC，深夜导出的文件名日期会差一天。
  return `${slug || 'bank'}-${dateKey(bank.importedAt)}.tixing.json`
}

export function downloadBankPackage(bank: ImportedBank): void {
  const payload = JSON.stringify(buildExportPackage(bank), null, 2)
  downloadBlob(exportFileName(bank), new Blob([payload], { type: 'application/json;charset=utf-8' }))
}

/** v1 → v2：补齐 v2 引入的可选字段，保持旧包可读。 */
function migrateV1ToV2(bank: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const next = { ...bank }
  if (next.description === undefined) next.description = ''
  if (next.tags === undefined) next.tags = []
  if (next.icon === undefined) next.icon = 'book'
  if (next.level === undefined) next.level = '入门'
  if (next.durationMin === undefined) next.durationMin = 10
  warnings.push('题库包为 v1 格式，已自动升级到 v2')
  return next
}

export function parseExportPackage(raw: string): ParsePackageResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { bank: null, error: 'JSON 解析失败', warnings: [], version: null }
  }
  if (typeof data !== 'object' || data === null) {
    return { bank: null, error: '格式不正确', warnings: [], version: null }
  }
  const pkg = data as Partial<ExportPackage> & { bank?: Record<string, unknown> }
  if (pkg.format !== BANK_PACKAGE_FORMAT || typeof pkg.bank !== 'object' || pkg.bank === null) {
    return { bank: null, error: '不是题小星题库包（缺少 tixing-bank 标识）', warnings: [], version: null }
  }

  const rawVersion = typeof pkg.version === 'number' ? pkg.version : BANK_PACKAGE_MIN_VERSION
  const warnings: string[] = []
  if (rawVersion > BANK_PACKAGE_VERSION) {
    return {
      bank: null,
      error: `题库包版本 ${rawVersion} 高于当前支持的 ${BANK_PACKAGE_VERSION}，请升级应用后再导入`,
      warnings,
      version: rawVersion,
    }
  }
  if (rawVersion < BANK_PACKAGE_MIN_VERSION) {
    return {
      bank: null,
      error: `题库包版本 ${rawVersion} 过低，无法识别`,
      warnings,
      version: rawVersion,
    }
  }

  let bankRecord: Record<string, unknown> = pkg.bank
  if (rawVersion === 1) {
    bankRecord = migrateV1ToV2(bankRecord, warnings)
  }

  if (!Array.isArray(bankRecord.questions) || bankRecord.questions.length === 0) {
    return { bank: null, error: '题库包内没有题目', warnings, version: rawVersion }
  }

  const parsed = v.safeParse(BankContentSchema, bankRecord)
  if (!parsed.success) {
    const path = parsed.issues[0]?.path?.map((item) => String(item.key ?? '')).join('.')
    return {
      bank: null,
      error: `题库包字段不完整：${path || 'bank'}`,
      warnings,
      version: rawVersion,
    }
  }
  const content = parsed.output as ImportBankInput

  return {
    bank: {
      id: '',
      title: content.title || '未命名题库',
      subtitle: content.subtitle || '导入题库',
      description: content.description,
      exam: content.exam || content.title || '未命名题库',
      icon: content.icon,
      accent: content.accent,
      level: content.level,
      durationMin: content.durationMin,
      tags: content.tags,
      importedAt: 0,
      questions: content.questions,
    },
    error: '',
    warnings,
    version: rawVersion,
  }
}

export function looksLikeExportPackage(raw: string): boolean {
  return raw.includes(`"${BANK_PACKAGE_FORMAT}"`)
}
