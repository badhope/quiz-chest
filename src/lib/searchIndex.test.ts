import { describe, expect, it } from 'vitest'
import type { LibraryCollection } from './library'
import { searchLibrary } from './search'

function makeCollection(
  id: string,
  title: string,
  domainId: LibraryCollection['domainId'],
  tags: string[],
  questions: LibraryCollection['questions'],
): LibraryCollection {
  return {
    id,
    domainId,
    trackId: 'track-1',
    title,
    subtitle: `${title}副标题`,
    description: `${title}描述`,
    icon: 'book',
    level: '入门',
    exam: '测试考试',
    durationMin: 10,
    heat: id === 'hot' ? 99 : 1,
    tags,
    updated: '2026-01-01',
    questions,
    origin: 'imported',
    importedAt: 1,
    accent: '#123456',
  }
}

const library: LibraryCollection[] = [
  makeCollection('hot', '高等数学强化', 'university', ['微积分', '极限'], [
    {
      id: 'hot-1',
      collectionId: 'hot',
      type: 'single',
      stem: '求函数极限的基础方法是什么？',
      options: ['洛必达法则', '勾股定理'],
      answer: [0],
      explanation: '极限',
      difficulty: 2,
      tags: ['导数'],
    },
    {
      id: 'hot-2',
      collectionId: 'hot',
      type: 'judge',
      stem: '线性代数中的矩阵乘法满足交换律。',
      options: ['正确', '错误'],
      answer: [1],
      explanation: '矩阵',
      difficulty: 3,
      tags: ['矩阵'],
    },
  ]),
  makeCollection('cold', 'JavaScript 面试题', 'coding', ['前端', '闭包'], [
    {
      id: 'cold-1',
      collectionId: 'cold',
      type: 'single',
      stem: 'typeof null 的结果是什么？',
      options: ['null', 'object', 'undefined'],
      answer: [1],
      explanation: '历史遗留',
      difficulty: 2,
      tags: ['类型'],
    },
  ]),
]

describe('题库搜索索引', () => {
  it('中文二元组能命中标题、题干与选项', () => {
    expect(searchLibrary(library, '高等数学').collections[0]?.id).toBe('hot')
    expect(searchLibrary(library, '洛必达').questions[0]?.id).toBe('hot-1')
    expect(searchLibrary(library, '矩阵').questions[0]?.id).toBe('hot-2')
  })

  it('英文按词前缀命中，且不区分大小写', () => {
    expect(searchLibrary(library, 'java').collections[0]?.id).toBe('cold')
    expect(searchLibrary(library, 'TYPE').questions[0]?.id).toBe('cold-1')
  })

  it('多个词按“同时出现”匹配，而不是要求连续短语', () => {
    expect(searchLibrary(library, 'typeof object').questions[0]?.id).toBe('cold-1')
    expect(searchLibrary(library, '矩阵 交换律').questions[0]?.id).toBe('hot-2')
  })

  it('单字查询退回原文过滤，不会漏结果', () => {
    expect(searchLibrary(library, '矩').questions[0]?.id).toBe('hot-2')
  })

  it('空查询与无命中都返回空数组', () => {
    expect(searchLibrary(library, '   ')).toEqual({ collections: [], questions: [] })
    expect(searchLibrary(library, '完全不存在的关键词')).toEqual({
      collections: [],
      questions: [],
    })
  })

  it('题库结果按热度排序，题目结果尊重 limit', () => {
    expect(searchLibrary(library, '测试').collections.map((item) => item.id)).toEqual(['hot', 'cold'])
    expect(searchLibrary(library, '的', 1).questions).toHaveLength(1)
  })
})
