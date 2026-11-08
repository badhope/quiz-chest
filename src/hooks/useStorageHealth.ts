import { useEffect, useState } from 'react'
import { getStorageHealth, onStorageHealth, type StorageHealth } from '../lib/storage'

interface StorageStatus {
  health: StorageHealth
  message: string | null
}

/**
 * 订阅本地存储健康状态。存储配额耗尽或环境不可写时，
 * 页面据此提示用户导出数据，而不是静默丢数据。
 */
export function useStorageHealth(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>(() => {
    const current = getStorageHealth()
    return { health: current.health, message: current.message }
  })

  useEffect(
    () =>
      onStorageHealth((health, detail) => {
        setStatus({ health, message: detail?.message ?? null })
      }),
    [],
  )

  return status
}
