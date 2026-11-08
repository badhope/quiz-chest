import type { ImportedBank } from '../store/useAppStore'
import type { ImportBankInput } from './importer'
import { dateKey } from './quiz'

export const BANK_PACKAGE_FORMAT = 'tiyu-bank'
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
  return `${slug || 'bank'}-${dateKey(bank.importedAt)}.tiyu.json`
}

export function downloadBankPackage(bank: ImportedBank): void {
  const payload = JSON.stringify(buildExportPackage(bank), null, 2)
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportFileName(bank)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    return { bank: null, error: '不是题匣题库包（缺少 tiyu-bank 标识）', warnings: [], version: null }
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

  const bank = bankRecord as unknown as ImportBankInput
  if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
    return { bank: null, error: '题库包内没有题目', warnings, version: rawVersion }
  }

  return {
    bank: {
      id: '',
      title: bank.title ?? '未命名题库',
      subtitle: bank.subtitle ?? '导入题库',
      description: bank.description ?? '',
      exam: bank.exam ?? bank.title ?? '未命名题库',
      icon: bank.icon ?? 'book',
      accent: bank.accent ?? '#315B7D',
      level: bank.level ?? '入门',
      durationMin: bank.durationMin ?? 10,
      tags: bank.tags ?? [],
      importedAt: 0,
      questions: bank.questions,
    },
    error: '',
    warnings,
    version: rawVersion,
  }
}

export function looksLikeExportPackage(raw: string): boolean {
  return raw.includes(`"${BANK_PACKAGE_FORMAT}"`)
}
