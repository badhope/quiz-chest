import { useStorageHealth } from '../../hooks/useStorageHealth'
import { useAppStore } from '../../store/useAppStore'
import { useDataLayer } from '../../hooks/useDataLayer'
import { CircleAlert } from '../ui/icons'

/**
 * 本地存储降级提示条。
 *
 * 只在存储不可用或配额耗尽时出现，位置固定在内容区顶部，
 * 不遮挡导航；关闭后本次会话不再重复打扰（状态仍可从设置页查看）。
 */
export function StorageBanner() {
  const { health, message } = useStorageHealth()
  const dataLayer = useDataLayer()
  const persistenceError = useAppStore((state) => state.persistenceError)

  const detail =
    health !== 'ok'
      ? message
      : dataLayer.degraded
        ? dataLayer.message ?? '当前使用内存数据层，本次改动不会被保存。'
        : persistenceError
          ? `最近一次保存失败：${persistenceError}。这项改动可能只在本页生效，请重试或先导出备份。`
          : null
  if (!detail) return null

  return (
    <div className="storage-banner" role="status" aria-live="polite">
      <CircleAlert className="storage-banner-icon" />
      <p>{detail}</p>
    </div>
  )
}
