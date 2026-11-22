// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HistoryEntry, ImportedBank, WrongEntry } from '../data/records'
import {
  DEFAULT_SETTINGS,
  emptySnapshot,
  normalizeSnapshot,
  type Repository,
} from './repository'
import { createMemoryRepository } from './dataLayer'
import { createIndexedDbRepository } from './indexedDbRepository'

const DB_NAME = 'tixing'

function bank(id: string, questions = 2): ImportedBank {
  return {
    id,
    title: `题库 ${id}`,
    subtitle: '',
    description: '',
    exam: '',
    icon: 'book',
    accent: '#000',
    level: '入门',
    durationMin: 10,
    tags: [],
    importedAt: 1000,
    questions: Array.from({ length: questions }, (_, index) => ({
      type: 'single' as const,
      stem: `题干 ${index}`,
      options: ['A', 'B'],
      answer: [0],
      explanation: '',
      difficulty: 1 as const,
      tags: [],
    })),
  }
}

const wrong: WrongEntry = {
  questionId: 'b1-1',
  collectionId: 'b1',
  wrongCount: 1,
  lastWrongAt: 1,
  lastSelection: [0],
}

function history(id: string, finishedAt: number): HistoryEntry {
  return {
    id,
    mode: 'practice',
    collectionId: 'b1',
    collectionTitle: '题库 b1',
    answered: 2,
    correct: 1,
    wrong: 1,
    skipped: 0,
    total: 2,
    accuracy: 50,
    durationSec: 60,
    finishedAt,
    dateKey: '2026-11-06',
  }
}

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

const implementations = [
  { name: '内存仓储', create: createMemoryRepository, cleanDatabase: false },
  { name: 'IndexedDB 仓储', create: createIndexedDbRepository, cleanDatabase: true },
]

describe.each(implementations)('$name 契约', ({ create, cleanDatabase }) => {
  let repo: Repository

  beforeEach(async () => {
    repo = create()
    await repo.replaceAll(emptySnapshot())
  })

  afterEach(async () => {
    await repo.close()
    if (cleanDatabase) await deleteDatabase()
  })

  it('未完成会话可写入与清除，重置学习数据会一并清掉', async () => {
    await repo.setPendingSession({
      id: 'session',
      collectionId: 'b1',
      collectionTitle: '题库 b1',
      mode: 'practice',
      questionIds: ['b1-1'],
      answers: {},
      checkedIds: [],
      index: 0,
      startedAt: 1,
      remainingSec: null,
      title: '题库 b1',
    })
    expect((await repo.load()).pendingSession?.id).toBe('session')

    await repo.resetProgress()
    expect((await repo.load()).pendingSession).toBeNull()
  })

  it('快照按 id 去重、同题库保留最近 20 份，可按题库清空', async () => {
    for (let index = 0; index < 22; index += 1) {
      await repo.addBankSnapshot({
        id: `b1:r${index}`,
        bankId: 'b1',
        savedAt: index,
        revision: index + 1,
        bank: bank('b1'),
      })
    }
    await repo.addBankSnapshot({
      id: 'b1:r21',
      bankId: 'b1',
      savedAt: 21,
      revision: 22,
      bank: bank('b1', 3),
    })
    await repo.addBankSnapshot({
      id: 'b2:r1',
      bankId: 'b2',
      savedAt: 1,
      revision: 1,
      bank: bank('b2'),
    })

    let snapshot = await repo.load()
    expect(snapshot.bankSnapshots.filter((item) => item.bankId === 'b1')).toHaveLength(20)
    expect(snapshot.bankSnapshots.filter((item) => item.id === 'b1:r21')).toHaveLength(1)
    expect(snapshot.bankSnapshots.map((item) => item.id)).not.toContain('b1:r0')

    await repo.clearBankSnapshots('b1')
    snapshot = await repo.load()
    expect(snapshot.bankSnapshots.map((item) => item.id)).toEqual(['b2:r1'])
  })

  it('清空收藏、错题、记录互不越界', async () => {
    await repo.setFavorite('b1-1', true)
    await repo.recordWrong(wrong)
    await repo.addHistory(history('h1', 1000))

    await repo.clearFavorites()
    let snapshot = await repo.load()
    expect(snapshot.favorites).toEqual([])
    expect(Object.keys(snapshot.wrongBook)).toEqual(['b1-1'])
    expect(snapshot.history).toHaveLength(1)

    await repo.clearWrongBook()
    snapshot = await repo.load()
    expect(snapshot.wrongBook).toEqual({})
    expect(snapshot.history).toHaveLength(1)

    await repo.clearHistory()
    snapshot = await repo.load()
    expect(snapshot.history).toEqual([])
    expect(snapshot.daily).toEqual({})
  })

  it('删除单条错题与删除题库的级联语义一致', async () => {
    await repo.upsertBank(bank('b1'))
    await repo.upsertBank(bank('b2'))
    await repo.setFavorite('b1-1', true)
    await repo.setFavorite('b2-1', true)
    await repo.recordWrong(wrong)
    await repo.recordWrong({ ...wrong, questionId: 'b2-1', collectionId: 'b2' })
    await repo.addBankSnapshot({ id: 'b1:r1', bankId: 'b1', savedAt: 1, revision: 1, bank: bank('b1') })
    await repo.addBankSnapshot({ id: 'b2:r1', bankId: 'b2', savedAt: 1, revision: 1, bank: bank('b2') })

    await repo.removeWrong('b2-1')
    expect(Object.keys((await repo.load()).wrongBook)).toEqual(['b1-1'])

    await repo.deleteBank('b1')
    const snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['b2'])
    expect(snapshot.favorites).toEqual(['b2-1'])
    expect(snapshot.wrongBook).toEqual({})
    expect(snapshot.bankSnapshots.map((item) => item.id)).toEqual(['b2:r1'])
  })

  it('全量替换会清掉未出现在备份里的旧数据', async () => {
    await repo.upsertBank(bank('old'))
    await repo.setFavorite('old-1', true)
    await repo.addHistory(history('old-history', 1000))

    await repo.replaceAll(
      normalizeSnapshot({
        settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
        favorites: [],
        wrongBook: [],
        history: [],
        daily: [],
        lastCollectionId: null,
        banks: [bank('new')],
        papers: [],
        pendingSession: null,
        bankSnapshots: [],
      }),
    )
    const snapshot = await repo.load()
    expect(snapshot.banks.map((item) => item.id)).toEqual(['new'])
    expect(snapshot.favorites).toEqual([])
    expect(snapshot.history).toEqual([])
    expect(snapshot.settings.theme).toBe('dark')
  })
})
