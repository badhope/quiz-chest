import type { HistoryEntry, WrongEntry } from '../store/useAppStore'

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

export function downloadCsv(fileName: string, csv: string): void {
  // UTF-8 BOM 让 Excel 正确识别中文
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const MODE_LABEL: Record<string, string> = {
  practice: '顺序练习',
  exam: '模拟考试',
  review: '错题重练',
}

export function historyToCsv(history: HistoryEntry[]): string {
  const headers = ['完成时间', '模式', '题库', '作答', '答对', '答错', '跳过', '总题数', '正确率%', '用时秒']
  const rows = [...history].reverse().map((entry) => [
    new Date(entry.finishedAt).toLocaleString('zh-CN', { hour12: false }),
    MODE_LABEL[entry.mode] ?? entry.mode,
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
  resolveQuestion: (id: string) => { stem: string; collectionId: string; wrongCount: number; lastWrongAt: number } | undefined,
  resolveCollectionTitle: (id: string) => string,
): string {
  const headers = ['题干', '所属题库', '错误次数', '最近出错']
  const rows = Object.values(wrongBook)
    .sort((a, b) => b.lastWrongAt - a.lastWrongAt)
    .map((entry) => {
      const question = resolveQuestion(entry.questionId)
      return [
        question?.stem ?? `（题目已删除：${entry.questionId}）`,
        resolveCollectionTitle(entry.collectionId),
        entry.wrongCount,
        new Date(entry.lastWrongAt).toLocaleString('zh-CN', { hour12: false }),
      ]
    })
  return toCsv(headers, rows)
}

// 唯一实现在 lib/quiz.ts；此处保留导出名，避免动调用方。
export { dateStamp } from './quiz'
