// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StorageBanner } from './StorageBanner'
import { useAppStore } from '../../store/useAppStore'

describe('保存失败提示条', () => {
  afterEach(() => {
    useAppStore.setState({ persistenceError: null })
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
})
