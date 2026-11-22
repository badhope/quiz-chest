// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getCollection, getQuestion } from '../data'
import { getLibraryCollections } from './library'
import { useAppStore } from '../store/useAppStore'
import type { ImportedBank } from '../data/records'

function bank(id: string, title: string): ImportedBank {
  return {
    id,
    title,
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
      { type: 'single', stem: '第一题', options: ['甲', '乙'], answer: [0], explanation: '', difficulty: 1, tags: [] },
      { type: 'single', stem: '第二题', options: ['A', 'B'], answer: [1], explanation: '', difficulty: 1, tags: [] },
    ],
  }
}

describe('导入题库查询缓存', () => {
  beforeEach(() => {
    useAppStore.setState({ banks: [], banksVersion: 0 })
  })

  it('同一版本内 getCollection 复用缓存对象，不重复构造全部题目', () => {
    useAppStore.setState({ banks: [bank('b1', '题库一')], banksVersion: 10 })
    const first = getCollection('b1')
    const second = getCollection('b1')
    expect(first).toBeDefined()
    expect(first).toBe(second)
    expect(getLibraryCollections()[0]).toBe(first)
  })

  it('题库版本变化后返回新快照，旧对象不被修改', () => {
    useAppStore.setState({ banks: [bank('b1', '旧标题')], banksVersion: 20 })
    const old = getCollection('b1')!
    useAppStore.setState({ banks: [bank('b1', '新标题')], banksVersion: 21 })
    const next = getCollection('b1')!
    expect(next.title).toBe('新标题')
    expect(old.title).toBe('旧标题')
    expect(next).not.toBe(old)
  })

  it('导入题目可按 id 取回并保留题干', () => {
    useAppStore.setState({ banks: [bank('b1', '题库一')], banksVersion: 10 })
    expect(getQuestion('b1-1')?.stem).toBe('第一题')
    expect(getQuestion('b1-2')?.stem).toBe('第二题')
  })
})
