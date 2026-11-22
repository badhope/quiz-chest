// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from './useAppStore'
import { createMemoryRepository } from '../services/dataLayer'
import { DEFAULT_SETTINGS } from '../services/repository'
import { waitUntil } from '../test/waitFor'
import type { HistoryEntry } from '../data/records'

function history(): HistoryEntry {
  return {
    id: 'h1',
    mode: 'practice',
    collectionId: 'b1',
    collectionTitle: '题库',
    answered: 10,
    correct: 7,
    wrong: 3,
    skipped: 0,
    total: 10,
    accuracy: 70,
    durationSec: 120,
    finishedAt: 1000,
    dateKey: '2026-11-06',
  }
}

function reset(): void {
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    favorites: [],
    wrongBook: {},
    history: [],
    daily: {},
    lastCollectionId: null,
    banks: [],
    banksVersion: 0,
    papers: [],
    pendingSession: null,
    bankSnapshots: [],
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

function seed(): void {
  useAppStore.setState({
    favorites: ['q1'],
    history: [history()],
    daily: { '2026-11-06': { date: '2026-11-06', answered: 10, correct: 7 } },
    lastCollectionId: 'b1',
  })
}

describe('重置学习数据', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('落库成功后才清空内存状态', async () => {
    const memory = createMemoryRepository()
    attachRepositoryForTest(memory)
    useAppStore.getState().toggleFavorite('q1')
    useAppStore.getState().addHistory(history())
    await waitUntil(async () => {
      const snapshot = await memory.load()
      return snapshot.favorites.includes('q1') && snapshot.history.length === 1
    }, { label: '数据写入' })
    seed()

    await useAppStore.getState().resetProgress()
    expect(useAppStore.getState().favorites).toEqual([])
    expect(useAppStore.getState().history).toEqual([])
    expect(useAppStore.getState().daily).toEqual({})
    expect(useAppStore.getState().lastCollectionId).toBeNull()
    expect((await memory.load()).favorites).toEqual([])
    expect((await memory.load()).history).toEqual([])
  })

  it('落库失败时不清内存，也不进入自动重试队列', async () => {
    const memory = createMemoryRepository()
    attachRepositoryForTest({
      ...memory,
      async resetProgress() {
        throw new Error('磁盘已满')
      },
    })
    seed()

    await expect(useAppStore.getState().resetProgress()).rejects.toThrow('磁盘已满')
    expect(useAppStore.getState().favorites).toEqual(['q1'])
    expect(useAppStore.getState().history).toHaveLength(1)
    expect(useAppStore.getState().daily).toHaveProperty('2026-11-06')
    expect(useAppStore.getState().persistenceError).toContain('磁盘已满')
    expect((await memory.load()).favorites).toEqual([])
  })
})
