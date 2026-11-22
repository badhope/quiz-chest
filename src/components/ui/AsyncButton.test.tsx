// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AsyncButton } from './AsyncButton'

describe('AsyncButton', () => {
  it('确认取消时不执行动作', () => {
    const action = vi.fn(async () => {})
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <AsyncButton confirmText="确定删除？" action={action}>
        删除
      </AsyncButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(action).not.toHaveBeenCalled()
  })

  it('执行期间禁用并显示忙碌文案，完成后恢复', async () => {
    let release!: () => void
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    render(
      <AsyncButton busyLabel="删除中…" action={action}>
        删除
      </AsyncButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('button', { name: '删除中…' })).toBeDisabled()
    // 连点不会重复触发。
    fireEvent.click(screen.getByRole('button', { name: '删除中…' }))
    expect(action).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeEnabled())
  })

  it('动作抛错后按钮恢复，不留下未处理异常', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const action = vi.fn(async () => {
      throw new Error('磁盘已满')
    })
    render(<AsyncButton action={action}>保存</AsyncButton>)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
    expect(error).toHaveBeenCalled()
  })
})
