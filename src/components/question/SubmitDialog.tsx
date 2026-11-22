import { useRef } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Trophy, X } from '../ui/icons'

export interface SubmitDialogProps {
  open: boolean
  modeLabel: string
  answered: number
  total: number
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 交卷确认框。
 *
 * 具备模态对话框的必要行为：Esc 关闭、焦点在打开时移入、
 * Tab 在框内循环、背景点击关闭、关闭后焦点还原、`aria-modal` 标记。
 * 焦点管理集中在 `useDialogFocus`，与搜索框共用同一套语义。
 */
export function SubmitDialog({
  open,
  modeLabel,
  answered,
  total,
  onCancel,
  onConfirm,
}: SubmitDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useDialogFocus(cardRef, { open, onClose: onCancel, initialFocus: confirmRef })

  if (!open) return null

  const unanswered = total - answered

  return (
    <div className="confirm-layer" role="presentation" onClick={onCancel}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label="确认交卷"
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button confirm-close" onClick={onCancel} aria-label="关闭">
          <X />
        </button>
        <span className="confirm-icon">
          <Trophy />
        </span>
        <h2 className="serif">确认提交本次{modeLabel}？</h2>
        <p>
          已作答 {answered} / {total} 题
          {unanswered > 0 ? `，还有 ${unanswered} 题未作答` : ''}
          。提交后将生成成绩单，未作答按跳过计。
        </p>
        <div className="confirm-actions">
          <button className="button button-ghost" onClick={onCancel}>
            继续作答
          </button>
          <button ref={confirmRef} className="button button-primary" onClick={onConfirm}>
            提交并查看结果
          </button>
        </div>
      </div>
    </div>
  )
}
