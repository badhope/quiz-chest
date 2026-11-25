import { describe, expect, it } from 'vitest'
import { dateStamp } from './datetime'
import { historyToCsv, toCsv, wrongBookToCsv } from './csvExport'
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
        'demo-1': { questionId: 'demo-1', collectionId: 'demo', wrongCount: 2, lastWrongAt: 2000, lastSelection: [0], reason: 'careless', note: '看漏了条件' },
        'demo-2': { questionId: 'demo-2', collectionId: 'demo', wrongCount: 1, lastWrongAt: 3000, lastSelection: [], lastText: '只有光照' },
      },
      (id) => ({
        stem: id === 'demo-1' ? '第一题' : '第二题',
        collectionId: 'demo',
        wrongCount: id === 'demo-1' ? 2 : 1,
        lastWrongAt: id === 'demo-1' ? 2000 : 3000,
      }),
      () => '验收题库',
    )
    const rows = csv.trim().split('\r\n')
    expect(rows[0]).toContain('最近作答')
    expect(rows[1]).toContain('第二题')
    expect(rows[1]).toContain('只有光照')
    expect(rows[2]).toContain('第一题')
    expect(rows[2]).toContain('验收题库')
    expect(rows[2]).toContain('粗心')
    expect(rows[2]).toContain('看漏了条件')
  })
})

describe('dateStamp', () => {
  it('formats YYYYMMDD', () => {
    expect(dateStamp(new Date('2026-10-30T12:00:00').getTime())).toMatch(/^202610(29|30)$/)
  })
})
