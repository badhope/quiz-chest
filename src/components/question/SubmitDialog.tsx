import * as Dialog from '@radix-ui/react-dialog'
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
 * 焦点陷阱、Esc、背景点击、滚动锁定、关闭后焦点还原全部交给 Radix Dialog，
 * 不再自己维护 keydown 监听与可聚焦元素列表——这类代码写对一次很难，
 * 写错时只有键盘用户会撞上。
 */
export function SubmitDialog({
  open,
  modeLabel,
  answered,
  total,
  onCancel,
  onConfirm,
}: SubmitDialogProps) {
  const unanswered = total - answered

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-layer" />
        <Dialog.Content className="confirm-card" aria-label="确认交卷">
          <Dialog.Close asChild>
            <button className="icon-button confirm-close" aria-label="关闭">
              <X />
            </button>
          </Dialog.Close>
          <span className="confirm-icon">
            <Trophy />
          </span>
          <Dialog.Title className="serif">确认提交本次{modeLabel}？</Dialog.Title>
          <Dialog.Description>
            已作答 {answered} / {total} 题
            {unanswered > 0 ? `，还有 ${unanswered} 题未作答` : ''}
            。提交后将生成成绩单，未作答按跳过计。
          </Dialog.Description>
          <div className="confirm-actions">
            <Dialog.Close asChild>
              <button className="button button-ghost">继续作答</button>
            </Dialog.Close>
            <button className="button button-primary" onClick={onConfirm}>
              提交并查看结果
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
