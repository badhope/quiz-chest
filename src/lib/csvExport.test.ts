import { describe, expect, it } from 'vitest'
import { dateStamp, historyToCsv, toCsv, wrongBookToCsv } from './csvExport'
import type { HistoryEntry } from '../store/useAppStore'

const entry: HistoryEntry = {
  id: 'h_1',
  mode: 'exam',
  collectionId: 'demo',
  collectionTitle: '验收测试 100 题',
  answered: 3,
  correct: 1,
  wrong: 2,
  skipped: 97,
  total: 100,
  accuracy: 33,
  durationSec: 91,
  finishedAt: new Date('2026-10-30T04:18:04').getTime(),
  dateKey: '2026-10-30',
}

describe('toCsv', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv(['题干', '备注'], [['含,逗号', '含"引号"']])
    expect(csv.split('\r\n')[0]).toBe('题干,备注')
    expect(csv.split('\r\n')[1]).toBe('"含,逗号","含""引号"""')
  })

  it('neutralizes formula-like text after control prefixes and preserves CSV quoting', () => {
    const csv = toCsv(
      ['=标题'],
      [['=SUM(A1,B1)', '+命令', '-文本', '@用户', '＝全角等号', '＋全角加号', '－全角减号', '＠全角艾特', '\uFEFF＝BOM', '\t=TAB', '\r=CR', '\n=LF', ' \t=空白', -1]],
    )

    expect(csv).toBe(
      `'=标题\r\n"'=SUM(A1,B1)",'+命令,'-文本,'@用户,'＝全角等号,'＋全角加号,'－全角减号,'＠全角艾特,'\uFEFF＝BOM,'\t=TAB,"'\r=CR","'\n=LF",' \t=空白,-1\r\n`,
    )
  })

  it('ends with CRLF', () => {
    const csv = toCsv(['a'], [['1']])
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})

describe('historyToCsv', () => {
  it('renders one row per entry, newest first', () => {
    const csv = historyToCsv([entry, { ...entry, id: 'h_2', accuracy: 80 }])
    const rows = csv.trim().split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('正确率%')
    expect(rows[1]).toContain('80')
    expect(rows[1]).not.toContain('33')
    expect(rows[2]).toContain('33')
    expect(rows[1]).toContain('模拟考试')
  })
})

describe('wrongBookToCsv', () => {
  it('resolves stems and titles, sorts by recency', () => {
    const csv = wrongBookToCsv(
      {
        'demo-1': { questionId: 'demo-1', collectionId: 'demo', wrongCount: 2, lastWrongAt: 2000, lastSelection: [0] },
        'demo-2': { questionId: 'demo-2', collectionId: 'demo', wrongCount: 1, lastWrongAt: 3000, lastSelection: [1] },
      },
      (id) => (id === 'demo-1' ? { stem: '第一题', collectionId: 'demo', wrongCount: 2, lastWrongAt: 2000 } : undefined),
      () => '验收题库',
    )
    const rows = csv.trim().split('\r\n')
    expect(rows[1]).toContain('demo-2')
    expect(rows[2]).toContain('第一题')
    expect(rows[2]).toContain('验收题库')
    expect(rows[2]).toContain('2')
  })
})

describe('dateStamp', () => {
  it('formats YYYYMMDD', () => {
    expect(dateStamp(new Date('2026-10-30T12:00:00').getTime())).toMatch(/^202610(29|30)$/)
  })
})
