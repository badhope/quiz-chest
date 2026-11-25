import type { HistoryEntry, WrongEntry } from '../store/useAppStore'
import { formatDateTime } from './datetime'
import { sessionModeLabel } from './quiz'
import { downloadBlob, type DownloadResult } from './download'

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number): string => {
    const text = String(value)
    const safeText =
      typeof value === 'string' && /^\s*[=+\-@＝＋－＠]/.test(text)
        ? `'${text}`
        : text
    return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

export function downloadCsv(fileName: string, csv: string): Promise<DownloadResult> {
  // UTF-8 BOM 让 Excel 正确识别中文
  return downloadBlob(fileName, new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
}

export function historyToCsv(history: HistoryEntry[]): string {
  const headers = ['完成时间', '模式', '题库', '作答', '答对', '答错', '跳过', '总题数', '正确率%', '用时秒']
  const rows = [...history].reverse().map((entry) => [
    formatDateTime(entry.finishedAt),
    sessionModeLabel(entry.mode),
    entry.collectionTitle,
    entry.answered,
    entry.correct,
    entry.wrong,
    entry.skipped,
    entry.total,
    entry.accuracy,
    entry.durationSec,
  ])
  return toCsv(headers, rows)
}

export function wrongBookToCsv(
  wrongBook: Record<string, WrongEntry>,
  resolveQuestion: (id: string) => { stem: string; collectionId: string; wrongCount: number; lastWrongAt: number; options?: string[] } | undefined,
  resolveCollectionTitle: (id: string) => string,
): string {
  const headers = ['题干', '所属题库', '错误次数', '最近出错', '最近作答', '错因', '笔记']
  const reasonLabels: Record<string, string> = {
    concept: '概念不清',
    method: '方法不对',
    careless: '粗心',
    time: '时间不够',
  }
  const rows = Object.values(wrongBook)
    .sort((a, b) => b.lastWrongAt - a.lastWrongAt)
    .map((entry) => {
      const question = resolveQuestion(entry.questionId)
      const lastAnswer = entry.lastText?.trim()
        ? entry.lastText.trim()
        : entry.lastSelection.length
          ? entry.lastSelection.map((value) => String.fromCharCode(65 + value)).join('、')
          : ''
      return [
        question?.stem ?? `（题目已删除：${entry.questionId}）`,
        resolveCollectionTitle(entry.collectionId),
        entry.wrongCount,
        new Date(entry.lastWrongAt).toLocaleString('zh-CN', { hour12: false }),
        lastAnswer,
        entry.reason ? reasonLabels[entry.reason] ?? entry.reason : '',
        entry.note ?? '',
      ]
    })
  return toCsv(headers, rows)
}

// 唯一实现在 lib/quiz.ts；此处保留导出名，避免动调用方。
