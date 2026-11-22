import { useState, type ReactNode } from 'react'

/**
 * 需要先落库再改界面的按钮。
 *
 * 破坏性操作（清空收藏、删除题库）不能在 await 之前就把列表清掉：
 * 失败时用户会看到“已删除”的假象。这个按钮负责确认、忙碌态与防连点，
 * 具体的内存更新由 action 在落库成功后完成。
 */
export function AsyncButton({
  children,
  busyLabel = '处理中…',
  confirmText,
  action,
  className = 'button button-ghost button-sm',
  disabled = false,
}: {
  children: ReactNode
  busyLabel?: string
  confirmText?: string
  action: () => Promise<unknown>
  className?: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      // 落库错误已经写进全局 persistenceError；这里只防未处理 rejection。
      console.error('操作失败', error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      onClick={() => void run()}
    >
      {busy ? busyLabel : children}
    </button>
  )
}
