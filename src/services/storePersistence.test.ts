import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from '../store/useAppStore'
import { waitUntil } from '../test/waitFor'
import { createMemoryRepository } from '../services/dataLayer'
import type { Repository } from '../services/repository'
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
    importedAt: 1,
    questions: [
      {
        type: 'single',
        stem: '题',
        options: ['A', 'B'],
        answer: [0],
        explanation: '',
        difficulty: 1,
        tags: [],
      },
    ],
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
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('store 与数据库的联动', () => {
  beforeEach(() => {
    reset()
  })

  afterEach(() => {
    attachRepositoryForTest(null)
    reset()
  })

  it('hydrate 从数据库把状态读进内存', async () => {
    const repo = createMemoryRepository()
    await repo.upsertBank(bank('from-db'))
    await repo.saveSettings({
      theme: 'dark',
      fontScale: 'large',
      autoNext: true,
      showSampleBanks: false,
    })
    attachRepositoryForTest(repo)

    await useAppStore.getState().hydrate()

    const state = useAppStore.getState()
    expect(state.hydration).toBe('ready')
    expect(state.banks.map((item) => item.id)).toEqual(['from-db'])
    expect(state.settings.theme).toBe('dark')
    expect(state.settings.showSampleBanks).toBe(false)
  })

  it('写操作真的落到数据库，而不只是改了内存', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    useAppStore.getState().addBank(bank('written'))
    useAppStore.getState().toggleFavorite('q-1')

    // 等落库完成再断言：固定 0ms 延时在负载高时会假失败。
    await waitUntil(async () => {
      const snapshot = await repo.load()
      return snapshot.banks.length === 1 && snapshot.favorites.length === 1
    }, { label: '题库与收藏落库' })

    const persisted = await repo.load()
    expect(persisted.banks.map((item) => item.id)).toEqual(['written'])
    expect(persisted.favorites).toEqual(['q-1'])
  })

  it('落库失败会暴露错误，不静默吞掉', async () => {
    const failing: Repository = {
      ...createMemoryRepository(),
      async upsertBank() {
        throw new Error('磁盘已满')
      },
    }
    attachRepositoryForTest(failing)
    await useAppStore.getState().hydrate()

    // addBank 会 reject（详见 editFlow.test 的语义测试）；这里断言的是
    // 「即使调用方忽略返回值，错误也会进 persistenceError」，所以要吞掉 rejection。
    await useAppStore.getState().addBank(bank('x')).catch(() => {})

    expect(useAppStore.getState().persistenceError).toContain('磁盘已满')
    // 内存态仍然更新，界面不会因为落库失败而回滚
    expect(useAppStore.getState().banks).toHaveLength(1)
  })

  it('hydrate 只执行一次，重复调用不会覆盖新状态', async () => {
    const repo = createMemoryRepository()
    await repo.upsertBank(bank('initial'))
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    useAppStore.getState().addBank(bank('later'))
    await useAppStore.getState().hydrate()

    expect(useAppStore.getState().banks.map((item) => item.id)).toEqual(['initial', 'later'])
  })

  it('错题累计与每日统计写入数据库', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    useAppStore.getState().recordWrong({
      questionId: 'bank-1-1',
      collectionId: 'bank-1',
      lastSelection: [1],
    })
    useAppStore.getState().recordWrong({
      questionId: 'bank-1-1',
      collectionId: 'bank-1',
      lastSelection: [0],
    })
    useAppStore.getState().addHistory({
      id: 'h1',
      mode: 'practice',
      collectionId: 'bank-1',
      collectionTitle: '题库',
      answered: 4,
      correct: 3,
      wrong: 1,
      skipped: 0,
      total: 4,
      accuracy: 75,
      durationSec: 60,
      finishedAt: 1000,
      dateKey: '2026-11-06',
    })
    await waitUntil(async () => {
      const snapshot = await repo.load()
      return snapshot.wrongBook['bank-1-1']?.wrongCount === 2 && snapshot.daily['2026-11-06']?.answered === 4
    }, { label: '错题与每日统计落库' })

    const persisted = await repo.load()
    expect(persisted.wrongBook['bank-1-1'].wrongCount).toBe(2)
    expect(persisted.wrongBook['bank-1-1'].lastSelection).toEqual([0])
    expect(persisted.daily['2026-11-06']).toEqual({
      date: '2026-11-06',
      answered: 4,
      correct: 3,
    })
  })
})
