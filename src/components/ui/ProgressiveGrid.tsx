import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

/**
 * 大列表渐进渲染。
 *
 * 这不是把每个卡片都塞进 DOM 再交给浏览器硬扛：首屏只挂前 `initial` 个，
 * 用户接近底部时再按 `step` 追加。配合 CSS 的 `content-visibility: auto`，
 * 已挂载但不在视口内的卡片也会跳过布局与绘制。
 *
 * 没有引入虚拟滚动库：题匣的题库详情不展示题目全表，真正的大列表是题库卡片，
 * 卡片高度随标题/标签变化。固定行高的虚拟化在这里会裁字，动态测量的虚拟化
 * 又会带来滚动抖动；渐进渲染更轻，也不会让键盘 Tab 顺序突然断掉。
 */
export function ProgressiveGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  resetKey,
  initial = 48,
  step = 48,
  label = '加载更多',
}: {
  items: readonly T[]
  renderItem: (item: T) => React.ReactNode
  getKey: (item: T) => React.Key
  className: string
  resetKey: string
  initial?: number
  step?: number
  label?: string
}) {
  const [limitState, setLimitState] = useState({ key: resetKey, limit: initial })
  const limit = limitState.key === resetKey ? limitState.limit : initial
  const sentinelRef = useRef<HTMLDivElement>(null)
  const advance = useCallback(() => {
    setLimitState({ key: resetKey, limit: Math.min(limit + step, items.length) })
  }, [items.length, limit, resetKey, step])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || limit >= items.length) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) advance()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [advance, items.length, limit])

  const visible = items.slice(0, limit)
  return (
    <div className={className}>
      {visible.map((item) => (
        <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
      ))}
      {limit < items.length ? (
        <div ref={sentinelRef} className="progressive-more" style={{ gridColumn: '1 / -1' }}>
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={advance}
          >
            {label}
          </button>
          <span className="mono">
            已显示 {visible.length} / {items.length}
          </span>
        </div>
      ) : null}
    </div>
  )
}
