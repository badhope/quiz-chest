// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  DataSnapshot,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  WrongEntry,
} from '../data/records'
import { DEFAULT_SETTINGS, normalizeSnapshot, snapshotToRaw } from './repository'
import { createIndexedDbRepository } from './indexedDbRepository'
import { createMemoryRepository } from './dataLayer'

const KB = 1024

function bank(id: string, questionCount: number, stemPad = 0): ImportedBank {
  return {
    id,
    title: `题库 ${id}`,
    subtitle: '副标题',
    description: '描述',
    exam: '考试',
    icon: 'book',
    accent: '#315B7D',
    level: '入门',
    durationMin: 20,
    tags: ['tag'],
    importedAt: 1000,
    questions: Array.from({ length: questionCount }, (_, index) => ({
      type: 'single' as const,
      stem: `题干 ${index}${'x'.repeat(stemPad)}`,
      options: ['A', 'B', 'C', 'D'],
      answer: [0],
      explanation: '解析',
      difficulty: 2 as const,
      tags: [],
    })),
  }
}

function history(id: string, finishedAt: number, dateKey = '2026-11-06'): HistoryEntry {
  return {
    id,
    mode: 'practice',
    collectionId: 'bank-a',
    collectionTitle: '题库 A',
    answered: 10,
    correct: 7,
    wrong: 3,
    skipped: 0,
    total: 10,
    accuracy: 70,
    durationSec: 120,
    finishedAt,
    dateKey,
  }
}

const wrong: WrongEntry = {
  questionId: 'bank-a-1',
  collectionId: 'bank-a',
  wrongCount: 2,
  lastWrongAt: 500,
  lastSelection: [1],
}

const paper: PaperRecord = {
  id: 'p1',
  title: '卷',
  collectionIds: ['bank-a'],
  count: 5,
  durationMin: 20,
  order: 'random',
  createdAt: 700,
}

describe('IndexedDB 仓储', () => {
  let repo: ReturnType<typeof createIndexedDbRepository>

  beforeEach(async () => {
    repo = createIndexedDbRepository()
  })

  // 必须先关闭连接再删库：未关闭的连接会让 deleteDatabase 一直挂起，
  // 后续 open 全部排队等锁，表现为所有写操作超时。
  afterEach(async () => {
    await repo.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('quizchest')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  })

  it('空库返回默认快照', async () => {
    const snapshot = await repo.load()
    expect(snapshot.settings).toEqual(DEFAULT_SETTINGS)
    expect(snapshot.banks).toEqual([])
    expect(snapshot.history).toEqual([])
    expect(snapshot.lastCollectionId).toBeNull()
  })

  it('题库可跨连接持久保存（不是内存态）', async () => {
    await repo.upsertBank(bank('bank-a', 3))
    await repo.close()

    const reopened = createIndexedDbRepository()
    const snapshot = await reopened.load()
    expect(snapshot.banks).toHaveLength(1)
    expect(snapshot.banks[0].questions).toHaveLength(3)
    await reopened.close()
  })

  it('收藏可增删并保持幂等', async () => {
    await repo.setFavorite('q1', true)
    await repo.setFavorite('q1', true)
    await repo.setFavorite('q2', true)
    let snapshot = await repo.load()
    expect(new Set(snapshot.favorites)).toEqual(new Set(['q1', 'q2']))

    await repo.setFavorite('q1', false)
    snapshot = await repo.load()
    expect(snapshot.favorites).toEqual(['q2'])
  })

  it('错题按整条记录写入，计数由调用方决定', async () => {
    // 仓储层不做自增：只有一个本地写入者，计数在 store 里算一次，
    // 这样界面与数据库看到的是同一个数字，重试也不会翻倍。
    await repo.recordWrong(wrong)
    let snapshot = await repo.load()
    expect(snapshot.wrongBook[wrong.questionId].wrongCount).toBe(2)

    await repo.recordWrong({ ...wrong, wrongCount: 10, lastSelection: [0] })
    snapshot = await repo.load()
    expect(snapshot.wrongBook[wrong.questionId].wrongCount).toBe(10)
    expect(snapshot.wrongBook[wrong.questionId].lastSelection).toEqual([0])
  })

  it('练习记录写入同时累加每日统计', async () => {
    await repo.addHistory(history('h1', 2000))
    await repo.addHistory(history('h2', 3000))
    const snapshot = await repo.load()
    expect(snapshot.history.map((entry) => entry.id)).toEqual(['h2', 'h1'])
    expect(snapshot.daily['2026-11-06']).toEqual({
      date: '2026-11-06',
      answered: 20,
      correct: 14,
    })
  })

  it('历史只保留最近 100 条', async () => {
    for (let index = 0; index < 105; index += 1) {
      await repo.addHistory(history(`h${index}`, index))
    }
    const snapshot = await repo.load()
    expect(snapshot.history).toHaveLength(100)
    expect(snapshot.history[0].id).toBe('h104')
  })

  it('同一历史记录重放不会把每日统计加两遍', async () => {
    await repo.addHistory(history('h1', 1000))
    await repo.addHistory(history('h1', 1000))
    const snapshot = await repo.load()
    expect(snapshot.history).toHaveLength(1)
    expect(snapshot.daily['2026-11-06']).toEqual({
      date: '2026-11-06',
      answered: 10,
      correct: 7,
    })
  })

  it('组卷只保留最近 20 条', async () => {
    for (let index = 0; index < 25; index += 1) {
      await repo.addPaper({ ...paper, id: `p${index}`, createdAt: index })
    }
    const snapshot = await repo.load()
    expect(snapshot.papers).toHaveLength(20)
    expect(snapshot.papers[0].id).toBe('p24')
  })

  it('整个快照可替换（备份恢复路径）', async () => {
    await repo.upsertBank(bank('old', 1))
    const next: DataSnapshot = normalizeSnapshot({
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      favorites: ['q9'],
      wrongBook: [wrong],
      history: [history('h1', 1000)],
      daily: [{ date: '2026-11-06', answered: 10, correct: 7 }],
      lastCollectionId: 'bank-a',
      banks: [bank('bank-a', 2)],
      papers: [paper],
      pendingSession: null,
      bankSnapshots: [],
    })
    await repo.replaceAll(next)
    const snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['bank-a'])
    expect(snapshot.settings.theme).toBe('dark')
    expect(snapshot.favorites).toEqual(['q9'])
    expect(snapshot.lastCollectionId).toBe('bank-a')
  })

  it('deleteBank 同时清掉该题库的错题与收藏', async () => {
    await repo.upsertBank(bank('gone', 2))
    await repo.upsertBank(bank('kept', 2))
    await repo.setFavorite('gone-1', true)
    await repo.setFavorite('kept-1', true)
    await repo.recordWrong({ ...wrong, questionId: 'gone-1', collectionId: 'gone' })
    await repo.recordWrong({ ...wrong, questionId: 'kept-1', collectionId: 'kept' })
    await repo.addBankSnapshot({ id: 'gone:r1', bankId: 'gone', savedAt: 1, revision: 1, bank: bank('gone', 2) })
    await repo.addBankSnapshot({ id: 'kept:r1', bankId: 'kept', savedAt: 1, revision: 1, bank: bank('kept', 2) })

    await repo.deleteBank('gone')

    const snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['kept'])
    expect(snapshot.favorites).toEqual(['kept-1'])
    expect(Object.keys(snapshot.wrongBook)).toEqual(['kept-1'])
    expect(snapshot.bankSnapshots.map((item) => item.id)).toEqual(['kept:r1'])
  })

  it('resetProgress 清空学习数据但保留题库', async () => {
    await repo.upsertBank(bank('bank-a', 2))
    await repo.setFavorite('q1', true)
    await repo.recordWrong(wrong)
    await repo.addHistory(history('h1', 1000))
    await repo.resetProgress()
    const snapshot = await repo.load()
    expect(snapshot.banks).toHaveLength(1)
    expect(snapshot.favorites).toEqual([])
    expect(snapshot.wrongBook).toEqual({})
    expect(snapshot.history).toEqual([])
    expect(snapshot.daily).toEqual({})
  })

  it('容量显著超过 localStorage 5MB 上限', async () => {
    // 400 题 × 每条约 14KB 题干 ≈ 5.6MB 原始文本，localStorage 会直接抛 QuotaExceededError。
    const big = bank('big', 400, 14000)
    await repo.upsertBank(big)
    const snapshot = await repo.load()
    const bytes = JSON.stringify(snapshotToRaw(snapshot)).length
    expect(bytes).toBeGreaterThan(5 * 1024 * KB)
    expect(snapshot.banks[0].questions).toHaveLength(400)
  }, 30_000)
})

describe('内存仓储', () => {
  it('提供与数据库实现一致的写读语义', async () => {
    const repo = createMemoryRepository()
    await repo.upsertBank(bank('m', 2))
    await repo.setFavorite('m-1', true)
    await repo.addHistory(history('h1', 1000))
    const snapshot = await repo.load()
    expect(snapshot.banks[0].id).toBe('m')
    expect(snapshot.favorites).toEqual(['m-1'])
    expect(snapshot.daily['2026-11-06'].answered).toBe(10)
    await repo.close()
  })

  it('deleteBank 同时清掉该题库的错题与收藏', async () => {
    const repo = createMemoryRepository()
    await repo.upsertBank(bank('gone', 2))
    await repo.upsertBank(bank('kept', 2))
    await repo.setFavorite('gone-1', true)
    await repo.setFavorite('kept-1', true)
    await repo.recordWrong({ ...wrong, questionId: 'gone-1', collectionId: 'gone' })
    await repo.recordWrong({ ...wrong, questionId: 'kept-1', collectionId: 'kept' })
    await repo.addBankSnapshot({ id: 'gone:r1', bankId: 'gone', savedAt: 1, revision: 1, bank: bank('gone', 2) })
    await repo.addBankSnapshot({ id: 'kept:r1', bankId: 'kept', savedAt: 1, revision: 1, bank: bank('kept', 2) })
    await repo.deleteBank('gone')
    const snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['kept'])
    expect(snapshot.favorites).toEqual(['kept-1'])
    expect(Object.keys(snapshot.wrongBook)).toEqual(['kept-1'])
    expect(snapshot.bankSnapshots.map((item) => item.id)).toEqual(['kept:r1'])
    await repo.close()
  })

  it('addBankSnapshot 按快照 id 去重并只保留最近 20 份', async () => {
    const repo = createMemoryRepository()
    for (let index = 0; index < 22; index += 1) {
      await repo.addBankSnapshot({
        id: `bank-a:${index}`,
        bankId: 'bank-a',
        savedAt: index,
        revision: index + 1,
        bank: bank('bank-a', 2),
      })
    }
    // 同一 id 再写一次不能变成两份。
    await repo.addBankSnapshot({
      id: 'bank-a:21',
      bankId: 'bank-a',
      savedAt: 21,
      revision: 22,
      bank: bank('bank-a', 2),
    })
    const snapshot = await repo.load()
    expect(snapshot.bankSnapshots).toHaveLength(20)
    expect(snapshot.bankSnapshots.map((item) => item.id)).not.toContain('bank-a:0')
    expect(snapshot.bankSnapshots.filter((item) => item.id === 'bank-a:21')).toHaveLength(1)
    await repo.close()
  })

  it('乱序写入也按时间归位，编辑旧题库不会跳到最前', async () => {
    const repo = createMemoryRepository()
    await repo.upsertBank({ ...bank('old', 1), importedAt: 1000 })
    await repo.upsertBank({ ...bank('new', 1), importedAt: 3000 })
    // 编辑旧题库：内容变了，但排序仍应按 importedAt，而不是写入顺序。
    await repo.upsertBank({ ...bank('old', 2), importedAt: 1000 })
    let snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['new', 'old'])
    expect(snapshot.banks[1].questions).toHaveLength(2)

    await repo.addHistory(history('late', 500))
    await repo.addHistory(history('early', 100))
    snapshot = await repo.load()
    expect(snapshot.history.map((entry) => entry.id)).toEqual(['late', 'early'])

    await repo.addPaper({ ...paper, id: 'late-paper', createdAt: 50 })
    await repo.addPaper({ ...paper, id: 'early-paper', createdAt: 10 })
    snapshot = await repo.load()
    expect(snapshot.papers.map((item) => item.id)).toEqual(['late-paper', 'early-paper'])
    await repo.close()
  })

  it('同一历史记录重放不会把每日统计加两遍', async () => {
    const repo = createMemoryRepository()
    await repo.addHistory(history('h1', 1000))
    await repo.addHistory(history('h1', 1000))
    const snapshot = await repo.load()
    expect(snapshot.history).toHaveLength(1)
    expect(snapshot.daily['2026-11-06']).toEqual({
      date: '2026-11-06',
      answered: 10,
      correct: 7,
    })
    await repo.close()
  })

  it('历史与组卷上限和数据库实现一致', async () => {
    const repo = createMemoryRepository()
    for (let index = 0; index < 105; index += 1) {
      await repo.addHistory(history(`h${index}`, index))
    }
    for (let index = 0; index < 25; index += 1) {
      await repo.addPaper({ ...paper, id: `p${index}`, createdAt: index })
    }
    const snapshot = await repo.load()
    expect(snapshot.history).toHaveLength(100)
    expect(snapshot.history[0].id).toBe('h104')
    expect(snapshot.papers).toHaveLength(20)
    expect(snapshot.papers[0].id).toBe('p24')
    await repo.close()
  })
})
