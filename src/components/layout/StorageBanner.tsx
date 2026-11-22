import { useStorageHealth } from '../../hooks/useStorageHealth'
import { CircleAlert } from '../ui/icons'

/**
 * 本地存储降级提示条。
 *
 * 只在存储不可用或配额耗尽时出现，位置固定在内容区顶部，
 * 不遮挡导航；关闭后本次会话不再重复打扰（状态仍可从设置页查看）。
 */
export function StorageBanner() {
  const { health, message } = useStorageHealth()
  if (health === 'ok' || !message) return null

  return (
    <div className="storage-banner" role="status" aria-live="polite">
      <CircleAlert className="storage-banner-icon" />
      <p>{message}</p>
    </div>
  )
}
