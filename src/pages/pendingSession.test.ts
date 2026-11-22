// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from '../store/useAppStore'
import { waitUntil } from '../test/waitFor'
import { createMemoryRepository } from '../services/dataLayer'
import type { PendingSession } from '../data/records'

function session(overrides: Partial<PendingSession> = {}): PendingSession {
  return {
    id: 's1',
    mode: 'practice',
    collectionId: 'bank-1',
    collectionTitle: '测试题库',
    questionIds: ['bank-1-1', 'bank-1-2'],
    answers: { 'bank-1-1': [0] },
    checkedIds: ['bank-1-1'],
    index: 1,
    startedAt: 1000,
    remainingSec: null,
    title: '测试题库',
    ...overrides,
  }
}

function reset(): void {
  useAppStore.setState({
    settings: { theme: 'light', fontScale: 'normal', autoNext: false, showSampleBanks: true },
    favorites: [],
    wrongBook: {},
    history: [],
    daily: {},
    lastCollectionId: null,
    banks: [],
    banksVersion: 0,
    papers: [],
    pendingSession: null,
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('未完成会话（断点续做）', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('保存后能写进数据库并读回，跨「重启」仍在', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    useAppStore.getState().savePendingSession(session())
    // 等落库完成再断言，固定 0ms 延时在负载高时会假失败。
    await waitUntil(async () => (await repo.load()).pendingSession !== null, {
      label: '会话落库',
    })

    // 直接查数据库，证明不是只在内存里
    const persisted = await repo.load()
    expect(persisted.pendingSession?.collectionId).toBe('bank-1')
    expect(persisted.pendingSession?.answers['bank-1-1']).toEqual([0])

    // 模拟重启：清空内存后重新 hydrate
    reset()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    expect(useAppStore.getState().pendingSession?.index).toBe(1)
  })

  it('交卷后清除会话，首页不再提示继续', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    useAppStore.getState().savePendingSession(session())
    await waitUntil(async () => (await repo.load()).pendingSession !== null, {
      label: '会话落库',
    })

    useAppStore.getState().clearPendingSession()
    await waitUntil(async () => (await repo.load()).pendingSession === null, {
      label: '会话清除',
    })
    expect(useAppStore.getState().pendingSession).toBeNull()
  })

  it('重置学习数据会一并清掉未完成会话', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    useAppStore.getState().savePendingSession(session())
    await waitUntil(async () => (await repo.load()).pendingSession !== null, {
      label: '会话落库',
    })

    useAppStore.getState().resetProgress()
    await waitUntil(async () => (await repo.load()).pendingSession === null, {
      label: '重置清会话',
    })
  })

  it('备份恢复不会带回旧机器的半截进度', async () => {
    const repo = createMemoryRepository()
    await repo.setPendingSession(session({ id: 'old-machine' }))
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    expect(useAppStore.getState().pendingSession?.id).toBe('old-machine')

    await useAppStore.getState().restoreBackup({
      settings: { theme: 'dark', fontScale: 'normal', autoNext: false, showSampleBanks: true },
      favorites: [],
      wrongBook: {},
      history: [],
      daily: {},
      banks: [],
      papers: [],
    })
    await waitUntil(async () => (await repo.load()).pendingSession === null, {
      label: '恢复备份清会话',
    })
    expect(useAppStore.getState().pendingSession).toBeNull()
  })
})
