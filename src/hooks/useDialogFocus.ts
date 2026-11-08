import { useEffect, type RefObject } from 'react'

/**
 * 模态对话框的键盘与焦点管理。
 *
 * 为什么需要它：`role="dialog"` + `aria-modal="true"` 只是告诉辅助技术「这是一个模态框」，
 * 并不约束真实键盘行为。没有这一层，Tab 会跑到背后的页面上，屏幕阅读器用户会进入
 * 一个被声明为「不可达」却仍然可聚焦的区域——比不做无障碍更糟。
 *
 * 行为：
 *   - 打开时把焦点移入容器（优先首个可聚焦元素）
 *   - Tab / Shift+Tab 在容器内循环
 *   - Esc 触发关闭
 *   - 关闭时把焦点还给打开前的元素，避免焦点掉到 body
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isVisible(element: HTMLElement): boolean {
  // 优先用原生 checkVisibility（Chromium 105+）：能正确处理 display/visibility/
  // content-visibility 等所有隐藏方式。
  const probe = element as HTMLElement & { checkVisibility?: () => boolean }
  if (typeof probe.checkVisibility === 'function') return probe.checkVisibility()
  // 回退路径不能依赖 offsetParent：jsdom 里它恒为 null，会把所有元素判成隐藏，
  // 焦点陷阱直接失效。只排除语义上明确的隐藏标记。
  if (element.hidden) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  return true
}

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible)
}

export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  options: { open: boolean; onClose: () => void; initialFocus?: RefObject<HTMLElement | null> },
): void {
  const { open, onClose, initialFocus } = options

  useEffect(() => {
    if (!open) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const previous = document.activeElement as HTMLElement | null
    const target = initialFocus?.current ?? focusables(container)[0] ?? container
    target.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables(container)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && container.contains(active)
      if (!inside) {
        // 焦点跑到对话框外时，下一次 Tab 直接拉回框内，而不是让用户继续
        // 在背景页面里游走——那正是 aria-modal 声称不会发生的事。
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // 监听在 document 而非容器：焦点被外力移到框外时，容器上的监听收不到按键。
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // 只有原本聚焦在页面内时才还原，避免抢走已经切走的焦点。
      if (previous && previous.isConnected) previous.focus()
    }
  }, [open, onClose, containerRef, initialFocus])
}
