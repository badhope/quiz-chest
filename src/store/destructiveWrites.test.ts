// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, hasPendingWrites, useAppStore } from './useAppStore'
import { createMemoryRepository } from '../services/dataLayer'
import { emptySnapshot, normalizeSnapshot, type Repository } from '../services/repository'
import { DEFAULT_SETTINGS } from '../services/repository'
import type { ImportedBank } from '../data/records'

function bank(id: string): ImportedBank {
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
    questions: [
      { type: 'single', stem: '题干', options: ['甲', '乙'], answer: [0], explanation: '', difficulty: 1, tags: [] },
    ],
  }
}

function reset(): void {
  useAppStore.setState({ ...emptySnapshot(), banksVersion: 0, hydration: 'idle' })
}

function seedState(): void {
  useAppStore.setState({
    favorites: ['bank-a-1'],
    wrongBook: {
      'bank-a-1': { questionId: 'bank-a-1', collectionId: 'bank-a', wrongCount: 2, lastWrongAt: 1, lastSelection: [0] },
    },
    history: [
      {
        id: 'h1',
        mode: 'practice',
        collectionId: 'bank-a',
        collectionTitle: '题库 A',
        answered: 2,
        correct: 1,
        wrong: 1,
        skipped: 0,
        total: 2,
        accuracy: 50,
        durationSec: 60,
        finishedAt: 1000,
        dateKey: '2026-11-06',
      },
    ],
    daily: { '2026-11-06': { date: '2026-11-06', answered: 2, correct: 1 } },
    lastCollectionId: 'bank-a',
    banks: [bank('bank-a')],
    bankSnapshots: [
      { id: 'bank-a:r1', bankId: 'bank-a', savedAt: 1, revision: 1, bank: bank('bank-a') },
    ],
  })
}

function seedRepository(memory: Repository): Promise<void> {
  return memory.replaceAll(
    normalizeSnapshot({
      settings: { ...DEFAULT_SETTINGS },
      favorites: ['bank-a-1'],
      wrongBook: [
        { questionId: 'bank-a-1', collectionId: 'bank-a', wrongCount: 2, lastWrongAt: 1, lastSelection: [0] },
      ],
      history: [
        {
          id: 'h1',
          mode: 'practice',
          collectionId: 'bank-a',
          collectionTitle: '题库 A',
          answered: 2,
          correct: 1,
          wrong: 1,
          skipped: 0,
          total: 2,
          accuracy: 50,
          durationSec: 60,
          finishedAt: 1000,
          dateKey: '2026-11-06',
        },
      ],
      daily: [{ date: '2026-11-06', answered: 2, correct: 1 }],
      lastCollectionId: 'bank-a',
      banks: [bank('bank-a')],
      papers: [],
      pendingSession: null,
      bankSnapshots: [
        { id: 'bank-a:r1', bankId: 'bank-a', savedAt: 1, revision: 1, bank: bank('bank-a') },
      ],
    }),
  )
}

describe('破坏性写操作', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('清空收藏失败时列表保持原样，且不进入自动重试队列', async () => {
    const memory = createMemoryRepository()
    await seedRepository(memory)
    let failing = true
    attachRepositoryForTest({
      ...memory,
      async clearFavorites() {
        if (failing) throw new Error('磁盘已满')
        return memory.clearFavorites()
      },
    })
    seedState()

    await expect(useAppStore.getState().clearFavorites()).resolves.toBe(false)
    expect(useAppStore.getState().favorites).toEqual(['bank-a-1'])
    expect(useAppStore.getState().persistenceError).toContain('磁盘已满')
    expect(hasPendingWrites()).toBe(false)

    failing = false
    await expect(useAppStore.getState().clearFavorites()).resolves.toBe(true)
    expect(useAppStore.getState().favorites).toEqual([])
    expect((await memory.load()).favorites).toEqual([])
  })

  it('清空记录与错题失败时内存和数据库都保持原样', async () => {
    const memory = createMemoryRepository()
    await seedRepository(memory)
    attachRepositoryForTest({
      ...memory,
      async clearHistory() {
        throw new Error('记录写入失败')
      },
      async clearWrongBook() {
        throw new Error('错题写入失败')
      },
    })
    seedState()

    await expect(useAppStore.getState().clearHistory()).resolves.toBe(false)
    await expect(useAppStore.getState().clearWrongBook()).resolves.toBe(false)
    expect(useAppStore.getState().history).toHaveLength(1)
    expect(useAppStore.getState().daily).toHaveProperty('2026-11-06')
    expect(Object.keys(useAppStore.getState().wrongBook)).toEqual(['bank-a-1'])
    expect(hasPendingWrites()).toBe(false)
    const snapshot = await memory.load()
    expect(snapshot.history).toHaveLength(1)
    expect(Object.keys(snapshot.wrongBook)).toEqual(['bank-a-1'])
  })

  it('删除题库失败时不从界面移除，成功后连同快照一起清掉', async () => {
    const memory = createMemoryRepository()
    await seedRepository(memory)
    let failing = true
    attachRepositoryForTest({
      ...memory,
      async deleteBank(bankId) {
        if (failing) throw new Error('删除失败')
        return memory.deleteBank(bankId)
      },
    })
    seedState()

    await expect(useAppStore.getState().removeBank('bank-a')).resolves.toBe(false)
    expect(useAppStore.getState().banks).toHaveLength(1)
    expect(useAppStore.getState().favorites).toEqual(['bank-a-1'])
    expect(useAppStore.getState().bankSnapshots).toHaveLength(1)
    expect(hasPendingWrites()).toBe(false)

    failing = false
    await expect(useAppStore.getState().removeBank('bank-a')).resolves.toBe(true)
    expect(useAppStore.getState().banks).toEqual([])
    expect(useAppStore.getState().favorites).toEqual([])
    expect(useAppStore.getState().wrongBook).toEqual({})
    expect(useAppStore.getState().bankSnapshots).toEqual([])
    const snapshot = await memory.load()
    expect(snapshot.banks).toEqual([])
    expect(snapshot.bankSnapshots).toEqual([])
  })
})
