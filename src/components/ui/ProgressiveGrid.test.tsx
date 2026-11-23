// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ProgressiveGrid } from './ProgressiveGrid'

const items = Array.from({ length: 10 }, (_, index) => index)

describe('ProgressiveGrid', () => {
  it('首屏只渲染 initial 个，点击后追加 step 个', async () => {
    const user = userEvent.setup()
    render(
      <ProgressiveGrid
        items={items}
        getKey={(item) => item}
        renderItem={(item) => <span>{`卡片 ${item}`}</span>}
        className="test-grid"
        resetKey="all"
        initial={3}
        step={2}
      />,
    )

    expect(screen.getByText('卡片 0')).toBeInTheDocument()
    expect(screen.queryByText('卡片 3')).not.toBeInTheDocument()
    expect(screen.getByText('已显示 3 / 10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '加载更多' }))
    expect(screen.getByText('卡片 4')).toBeInTheDocument()
    expect(screen.queryByText('卡片 5')).not.toBeInTheDocument()
  })

  it('resetKey 变化时回到首屏数量', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ProgressiveGrid
        items={items}
        getKey={(item) => item}
        renderItem={(item) => <span>{`卡片 ${item}`}</span>}
        className="test-grid"
        resetKey="all"
        initial={2}
        step={2}
      />,
    )
    await user.click(screen.getByRole('button', { name: '加载更多' }))
    expect(screen.getByText('卡片 2')).toBeInTheDocument()

    rerender(
      <ProgressiveGrid
        items={items}
        getKey={(item) => item}
        renderItem={(item) => <span>{`卡片 ${item}`}</span>}
        className="test-grid"
        resetKey="filtered"
        initial={2}
        step={2}
      />,
    )
    expect(screen.queryByText('卡片 2')).not.toBeInTheDocument()
  })
})
