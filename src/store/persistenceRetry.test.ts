// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  attachRepositoryForTest,
  hasPendingWrites,
  retryPendingWrites,
  useAppStore,
} from './useAppStore'
import { createMemoryRepository } from '../services/dataLayer'
import { DEFAULT_SETTINGS } from '../services/repository'
import { waitUntil } from '../test/waitFor'

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

describe('失败写入重试', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('失败的收藏写入留在队列里，重试后真正落库', async () => {
    const memory = createMemoryRepository()
    let failNext = true
    attachRepositoryForTest({
      ...memory,
      async setFavorite(questionId, favorite) {
        if (failNext) {
          failNext = false
          throw new Error('磁盘已满')
        }
        return memory.setFavorite(questionId, favorite)
      },
    })

    useAppStore.getState().toggleFavorite('q1')
    await waitUntil(() => hasPendingWrites(), { label: '失败写入入队' })
    expect(useAppStore.getState().persistenceError).toContain('磁盘已满')
    expect(useAppStore.getState().favorites).toContain('q1')

    await expect(retryPendingWrites()).resolves.toBe(true)
    expect(useAppStore.getState().persistenceError).toBeNull()
    expect(hasPendingWrites()).toBe(false)
    const snapshot = await memory.load()
    expect(snapshot.favorites).toContain('q1')
  })
})
