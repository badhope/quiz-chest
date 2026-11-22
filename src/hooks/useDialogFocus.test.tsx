// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDialogFocus } from './useDialogFocus'

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, {
    open,
    onClose: () => {
      onClose()
      setOpen(false)
    },
  })
  if (!open) return <button>outside</button>
  return (
    <div>
      <button>before</button>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="测试对话框">
        <button>first</button>
        <button>second</button>
        <button>last</button>
      </div>
      <button>after</button>
    </div>
  )
}

describe('useDialogFocus', () => {
  it('打开时把焦点移入对话框', () => {
    render(<Harness onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('Tab 在最后一个元素上循环回第一个', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    screen.getByText('last').focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('Shift+Tab 从第一个元素回绕到最后一个', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    screen.getByText('first').focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('last'))
  })

  it('焦点被外力移到对话框外后，Tab 会拉回内部', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    const outside = screen.getByText('after')
    outside.focus()
    expect(document.activeElement).toBe(outside)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('Esc 触发关闭回调', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('关闭后把焦点还原到打开前的元素', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    trigger.textContent = 'opener'
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = render(<Harness onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByText('first'))

    // 模拟关闭：重渲染为关闭态，effect 清理应还原焦点
    rerender(<Silent />)
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
    void user
  })
})

function Silent() {
  return null
}
