// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StorageBanner } from './StorageBanner'
import {
  attachRepositoryForTest,
  hasPendingWrites,
  useAppStore,
} from '../../store/useAppStore'
import { createMemoryRepository } from '../../services/dataLayer'
import { waitUntil } from '../../test/waitFor'

describe('保存失败提示条', () => {
  beforeEach(() => {
    useAppStore.setState({ persistenceError: null, favorites: [] })
  })
  afterEach(() => {
    attachRepositoryForTest(null)
  })

  it('没有错误时不渲染', () => {
    const { container } = render(<StorageBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('落库失败后在全局提示，而不是只藏在设置页', () => {
    useAppStore.setState({ persistenceError: '磁盘已满' })
    render(<StorageBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('最近一次保存失败：磁盘已满')
    expect(screen.getByRole('status')).toHaveTextContent('先导出备份')
  })

  it('有失败写入时提供重试按钮，重试成功后提示消失', async () => {
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
    render(<StorageBanner />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitUntil(() => !useAppStore.getState().persistenceError, { label: '重试完成' })
    expect((await memory.load()).favorites).toContain('q1')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
