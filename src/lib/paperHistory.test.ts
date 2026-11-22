import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type PaperRecord } from '../store/useAppStore'

function paper(id: string, createdAt: number): PaperRecord {
  return {
    id,
    title: `试卷 ${id}`,
    collectionIds: ['paper-a'],
    count: 10,
    durationMin: 30,
    order: 'random',
    createdAt,
  }
}

describe('paper history', () => {
  beforeEach(() => {
    useAppStore.setState({ papers: [] })
  })

  it('adds newest first', () => {
    useAppStore.getState().addPaper(paper('a', 1000))
    useAppStore.getState().addPaper(paper('b', 2000))
    const ids = useAppStore.getState().papers.map((item) => item.id)
    expect(ids).toEqual(['b', 'a'])
  })

  it('keeps at most 20 records', () => {
    for (let index = 0; index < 25; index += 1) {
      useAppStore.getState().addPaper(paper(`p${index}`, index))
    }
    const papers = useAppStore.getState().papers
    expect(papers).toHaveLength(20)
    expect(papers[0].id).toBe('p24')
  })

  it('replaces a record with the same id instead of duplicating', () => {
    useAppStore.getState().addPaper(paper('same', 1000))
    useAppStore.getState().addPaper({ ...paper('same', 2000), count: 25 })
    const papers = useAppStore.getState().papers
    expect(papers).toHaveLength(1)
    expect(papers[0].count).toBe(25)
  })

  it('removes a record by id', () => {
    useAppStore.getState().addPaper(paper('a', 1000))
    useAppStore.getState().addPaper(paper('b', 2000))
    useAppStore.getState().removePaper('a')
    expect(useAppStore.getState().papers.map((item) => item.id)).toEqual(['b'])
  })
})
