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
    expect((await memory.load()).favorites).toContain('q1')
  })

  it('同一键只保留最新任务，重试的是最后一次状态', async () => {
    const memory = createMemoryRepository()
    let failing = true
    let failures = 0
    attachRepositoryForTest({
      ...memory,
      async setFavorite(questionId, favorite) {
        if (failing) {
          failures += 1
          throw new Error(failures === 1 ? '第一次失败' : '第二次失败')
        }
        return memory.setFavorite(questionId, favorite)
      },
    })

    useAppStore.getState().toggleFavorite('q1')
    await waitUntil(() => useAppStore.getState().persistenceError === '第一次失败', {
      label: '第一次失败',
    })
    useAppStore.getState().toggleFavorite('q1')
    await waitUntil(() => useAppStore.getState().persistenceError === '第二次失败', {
      label: '第二次失败',
    })

    failing = false
    await expect(retryPendingWrites()).resolves.toBe(true)
    expect((await memory.load()).favorites).not.toContain('q1')
  })

  it('部分任务成功后停下，剩余任务留在队列里', async () => {
    const memory = createMemoryRepository()
    let favoriteFails = true
    let lastCollectionFails = true
    attachRepositoryForTest({
      ...memory,
      async setFavorite(questionId, favorite) {
        if (favoriteFails) throw new Error('收藏写入失败')
        return memory.setFavorite(questionId, favorite)
      },
      async setLastCollection(collectionId) {
        if (lastCollectionFails) throw new Error('会话写入失败')
        return memory.setLastCollection(collectionId)
      },
    })

    useAppStore.getState().toggleFavorite('q1')
    useAppStore.getState().setLastCollection('c1')
    await waitUntil(() => useAppStore.getState().persistenceError === '会话写入失败', {
      label: '两次失败都已入队',
    })

    favoriteFails = false
    await expect(retryPendingWrites()).resolves.toBe(false)
    expect(hasPendingWrites()).toBe(true)
    expect(useAppStore.getState().persistenceError).toContain('会话写入失败')
    expect((await memory.load()).favorites).toContain('q1')
    expect((await memory.load()).lastCollectionId).toBeNull()

    lastCollectionFails = false
    await expect(retryPendingWrites()).resolves.toBe(true)
    expect(hasPendingWrites()).toBe(false)
    expect((await memory.load()).lastCollectionId).toBe('c1')
  })

  it('并发触发重试时只跑一轮', async () => {
    const memory = createMemoryRepository()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    attachRepositoryForTest({
      ...memory,
      async setFavorite(questionId, favorite) {
        calls += 1
        if (calls === 1) throw new Error('磁盘已满')
        await gate
        return memory.setFavorite(questionId, favorite)
      },
    })

    useAppStore.getState().toggleFavorite('q1')
    await waitUntil(() => hasPendingWrites(), { label: '失败写入入队' })

    const first = retryPendingWrites()
    const second = retryPendingWrites()
    expect(second).toBe(first)
    expect(calls).toBe(2)
    release()
    await expect(first).resolves.toBe(true)
    expect(calls).toBe(2)
  })
})
