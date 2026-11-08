// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from '../store/useAppStore'
import { waitUntil } from '../test/waitFor'
import { createMemoryRepository } from '../services/dataLayer'
import { BANK_SNAPSHOT_LIMIT } from '../services/snapshotPolicy'
import type { ImportedBank } from '../data/records'

function bank(id: string, stem = '原始题干'): ImportedBank {
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
      { type: 'single', stem, options: ['甲', '乙'], answer: [0], explanation: '解析文字', difficulty: 1, tags: [] },
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
    pendingSession: null,
    bankSnapshots: [],
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('题库历史版本', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('存档后可跨「重启」读回', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('b1'))
    await waitUntil(() => useAppStore.getState().banks.length === 1, { label: '题库写入' })

    const snapshot = useAppStore.getState().archiveBankVersion(bank('b1', '旧题干'))
    expect(snapshot?.revision).toBe(1)
    await waitUntil(async () => (await repo.load()).bankSnapshots.length === 1, {
      label: '快照落库',
    })

    reset()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    expect(useAppStore.getState().bankSnapshots).toHaveLength(1)
    expect(useAppStore.getState().bankSnapshots[0].bank.questions[0].stem).toBe('旧题干')
  })

  it('回滚会恢复旧内容，并把当前版本也存为历史', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    // 当前是「新题干」，历史里存着「旧题干」
    useAppStore.getState().addBank(bank('b1', '新题干'))
    const old = useAppStore.getState().archiveBankVersion(bank('b1', '旧题干'))
    await useAppStore.getState().rollbackBankVersion(old!.id)

    const banks = useAppStore.getState().banks
    expect(banks[0].questions[0].stem).toBe('旧题干')
    // 回滚后当前版本（新题干）被存档，用户可以再滚回来
    const snapshots = useAppStore.getState().bankSnapshots
    expect(snapshots.some((item) => item.bank.questions[0].stem === '新题干')).toBe(true)
    // 被回滚的那份快照已消费掉
    expect(snapshots.some((item) => item.id === old!.id)).toBe(false)
  })

  it('同一题库最多保留 N 份，最旧的被淘汰', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('b1'))

    for (let index = 0; index < BANK_SNAPSHOT_LIMIT + 5; index += 1) {
      useAppStore.getState().archiveBankVersion(bank('b1', `版本 ${index}`))
      // 快照按 savedAt 排序，同一毫秒内的多次存档顺序不确定，必须拉开时间。
      await new Promise((resolve) => setTimeout(resolve, 3))
    }

    const snapshots = useAppStore.getState().bankSnapshots.filter((item) => item.bankId === 'b1')
    expect(snapshots).toHaveLength(BANK_SNAPSHOT_LIMIT)
    // 最新的那个还在
    expect(snapshots.some((item) => item.bank.questions[0].stem === `版本 ${BANK_SNAPSHOT_LIMIT + 4}`)).toBe(true)
    // 最旧的已被淘汰
    expect(snapshots.some((item) => item.bank.questions[0].stem === '版本 0')).toBe(false)
  })

  it('不同题库的历史互不影响', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('a'))
    useAppStore.getState().addBank(bank('b'))

    useAppStore.getState().archiveBankVersion(bank('a', 'a-旧'))
    useAppStore.getState().archiveBankVersion(bank('b', 'b-旧'))
    await waitUntil(() => useAppStore.getState().bankSnapshots.length === 2, {
      label: '两个题库各存一份',
    })

    const all = useAppStore.getState().bankSnapshots
    expect(all.filter((item) => item.bankId === 'a')).toHaveLength(1)
    expect(all.filter((item) => item.bankId === 'b')).toHaveLength(1)
    // 两个库的 revision 各自从 1 开始
    expect(all.find((item) => item.bankId === 'a')?.revision).toBe(1)
    expect(all.find((item) => item.bankId === 'b')?.revision).toBe(1)
  })

  it('删除题库时历史版本一并清除', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('gone'))
    useAppStore.getState().archiveBankVersion(bank('gone', '历史'))
    await waitUntil(async () => (await repo.load()).bankSnapshots.length === 1, {
      label: '快照落库',
    })

    useAppStore.getState().removeBank('gone')
    await waitUntil(async () => (await repo.load()).bankSnapshots.length === 0, {
      label: '删库清快照',
    })
    expect(useAppStore.getState().bankSnapshots).toHaveLength(0)
  })

  it('存档是深拷贝：后续修改题目不会串改历史', async () => {
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    await useAppStore.getState().hydrate()

    const original = bank('b1', '原始')
    useAppStore.getState().archiveBankVersion(original)
    // 直接改原对象：如果存档没深拷贝，历史会跟着变
    original.questions[0].stem = '被改掉了'
    original.title = '被改掉了'

    const snapshot = useAppStore.getState().bankSnapshots[0]
    expect(snapshot.bank.questions[0].stem).toBe('原始')
    expect(snapshot.bank.title).toBe('题库 b1')
  })
})

describe('快照 ID 唯一性', () => {
  it('同一毫秒内连续存档不会互相覆盖', () => {
    // 真实场景：改完立刻点保存、或回滚时「先存档当前版本再写入」，
    // 两次存档可能落在同一毫秒。曾经用时间戳当 ID，后一份会覆盖前一份。
    const repo = createMemoryRepository()
    attachRepositoryForTest(repo)
    useAppStore.setState({ bankSnapshots: [] })

    const a = useAppStore.getState().archiveBankVersion(bank('b1', '第一版'))
    const b = useAppStore.getState().archiveBankVersion(bank('b1', '第二版'))

    expect(a!.id).not.toBe(b!.id)
    const stored = useAppStore.getState().bankSnapshots
    expect(stored).toHaveLength(2)
    expect(stored.map((item) => item.bank.questions[0].stem).sort()).toEqual(['第一版', '第二版'])
    attachRepositoryForTest(null)
  })
})
