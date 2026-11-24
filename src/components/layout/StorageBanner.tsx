import { useState } from 'react'
import { hasPendingWrites, retryPendingWrites, useAppStore } from '../../store/useAppStore'
import { useDataLayer } from '../../hooks/useDataLayer'
import { CircleAlert } from '../ui/icons'

/**
 * 保存异常提示条。
 *
 * 数据层降级或写库失败时出现；只负责提示和重试，不替用户改数据。
 * 关闭后本次会话不再重复打扰，错误本身仍留在设置页。
 */
export function StorageBanner() {
  const dataLayer = useDataLayer()
  const persistenceError = useAppStore((state) => state.persistenceError)
  const [retrying, setRetrying] = useState(false)
  const canRetry = hasPendingWrites()

  const retry = async () => {
    setRetrying(true)
    try {
      await retryPendingWrites()
    } finally {
      setRetrying(false)
    }
  }

  const detail = dataLayer.degraded
    ? dataLayer.message ?? '当前使用内存数据层，本次改动不会被保存。'
    : persistenceError
      ? `最近一次保存失败：${persistenceError}。这项改动可能只在本页生效，请重试或先导出备份。`
      : null
  if (!detail) return null

  return (
    <div className="storage-banner" role="status" aria-live="polite">
      <CircleAlert className="storage-banner-icon" />
      <p>{detail}</p>
      {canRetry ? (
        <button
          type="button"
          className="storage-banner-action"
          onClick={() => void retry()}
          disabled={retrying}
        >
          {retrying ? '重试中…' : '重试'}
        </button>
      ) : null}
    </div>
  )
}
