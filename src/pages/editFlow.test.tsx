import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from '../store/useAppStore'
import { waitUntil } from '../test/waitFor'
import { createMemoryRepository } from '../services/dataLayer'
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
      { type: 'single', stem: '原始题干 A', options: ['甲', '乙', '丙'], answer: [0], explanation: '因为甲', difficulty: 1, tags: [] },
      { type: 'judge', stem: '原始判断题', options: ['对', '错'], answer: [1], explanation: '因为错', difficulty: 2, tags: [] },
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

describe('题库编辑（经 store 落库）', () => {
  beforeEach(() => {
    reset()
    attachRepositoryForTest(createMemoryRepository())
  })

  afterEach(() => {
    attachRepositoryForTest(null)
  })

  it('修改题干与答案后写回数据库，ID 与题序不变', async () => {
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('edit-1'))
    // 造一条错题，锁住题目 ID 的引用关系
    useAppStore.getState().recordWrong({ questionId: 'edit-1-2', collectionId: 'edit-1', lastSelection: [0] })
    await waitUntil(() => Object.keys(useAppStore.getState().wrongBook).length === 1, {
      label: '错题写入',
    })

    // 编辑器保存 = 同 ID 整库 upsert：题目数量与顺序保持，仅内容更新
    const original = useAppStore.getState().banks.find((item) => item.id === 'edit-1')!
    useAppStore.getState().addBank({
      ...original,
      questions: original.questions.map((question, index) =>
        index === 0
          ? { ...question, stem: '改过的题干', answer: [2], explanation: '因为丙才对' }
          : question,
      ),
    })
    await waitUntil(
      () => useAppStore.getState().banks[0]?.questions[0]?.stem === '改过的题干',
      { label: '题库更新' },
    )

    const state = useAppStore.getState()
    expect(state.banks[0].questions[0].stem).toBe('改过的题干')
    expect(state.banks[0].questions[0].answer).toEqual([2])
    expect(state.banks[0].questions[1].stem).toBe('原始判断题')
    // 题目 ID 未变：错题本仍然引用得上
    expect(state.wrongBook['edit-1-2']).toBeTruthy()
  })

  it('编辑后 banksVersion 递增，题库视图缓存会失效', async () => {
    await useAppStore.getState().hydrate()
    useAppStore.getState().addBank(bank('edit-2'))
    const before = useAppStore.getState().banksVersion
    const original = useAppStore.getState().banks.find((item) => item.id === 'edit-2')!
    useAppStore.getState().addBank({ ...original, title: '改名后的题库' })
    expect(useAppStore.getState().banksVersion).toBe(before + 1)
    expect(useAppStore.getState().banks[0].title).toBe('改名后的题库')
    // ID 不因改名而变化
    expect(useAppStore.getState().banks[0].id).toBe('edit-2')
  })

  it('落库失败时 addBank 会 reject，调用方才能如实报错', async () => {
    // 编辑器与备份恢复依赖这个语义：失败必须能被 await 感知。
    // 改成 fire-and-forget 时这条会失败（Promise 恒 resolve）。
    const failing = createMemoryRepository()
    attachRepositoryForTest({
      ...failing,
      async upsertBank() {
        throw new Error('磁盘已满')
      },
    })
    await useAppStore.getState().hydrate()

    await expect(useAppStore.getState().addBank(bank('fail-1'))).rejects.toThrow('磁盘已满')
    // 错误同时写进 persistenceError，设置页能显示
    expect(useAppStore.getState().persistenceError).toContain('磁盘已满')
  })

  it('数据层未就绪时写操作 reject，而不是静默丢掉', async () => {
    attachRepositoryForTest(null)
    await expect(useAppStore.getState().addBank(bank('no-repo'))).rejects.toThrow('数据层尚未就绪')
  })
})
