/**
 * 本地存储的容错封装。
 *
 * 为什么需要这一层：`localStorage` 在以下场景会直接抛错，导致整个应用白屏——
 *   1. 隐私模式 / 禁用 Cookie 的 WebView（Safari、部分安卓内嵌 WebView）
 *   2. 写入超出配额（导入大题库后最容易触发 QuotaExceededError）
 *   3. 原生 WebView 在磁盘满或权限受限时
 *
 * 策略：读取失败返回 `null` 让上层走默认值；写入失败降级为内存存储，
 * 保证当前会话可用，并向外广播一次容量告警供 UI 提示用户导出数据。
 */

export type StorageHealth = 'ok' | 'degraded' | 'unavailable'

type HealthListener = (health: StorageHealth, detail: { message: string } | null) => void

const listeners = new Set<HealthListener>()
let health: StorageHealth = 'ok'
let lastMessage: string | null = null

/** 内存兜底，写入失败后保证会话内状态仍然可用。 */
const memory = new Map<string, string>()

function notify(next: StorageHealth, message: string | null): void {
  if (health === next && lastMessage === message) return
  health = next
  lastMessage = message
  for (const listener of listeners) listener(next, message ? { message } : null)
}

export function onStorageHealth(listener: HealthListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStorageHealth(): { health: StorageHealth; message: string | null } {
  return { health, message: lastMessage }
}

/**
 * 探测 localStorage 是否可访问。
 *
 * 只做读取探测，不做写入探测：写入探测会在「配额已满」时也失败，
 * 从而把「空间不足」误判成「完全不可用」，两种情况的用户提示完全不同。
 * 访问属性或读取 length 抛错，才是真正的不可用（隐私模式 / 权限受限）。
 */
function probe(): Storage | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    // 访问 length 会触发真实存储访问，能暴露 SecurityError。
    void store.length
    return store
  } catch {
    return null
  }
}

let backing: Storage | null | undefined

function store(): Storage | null {
  if (backing === undefined) backing = probe()
  return backing
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  )
}

export const resilientStorage = {
  getItem(key: string): string | null {
    const target = store()
    if (target) {
      try {
        return target.getItem(key)
      } catch {
        // 读取异常降级到内存副本
      }
    }
    return memory.get(key) ?? null
  },

  setItem(key: string, value: string): void {
    const target = store()
    if (target) {
      try {
        target.setItem(key, value)
        memory.set(key, value)
        if (health !== 'ok') notify('ok', null)
        return
      } catch (error) {
        memory.set(key, value)
        if (isQuotaError(error)) {
          notify(
            'degraded',
            '本地存储空间不足，最新改动仅保留在本次会话中。建议导出题库与记录后清理空间。',
          )
        } else {
          notify('unavailable', '当前环境无法写入本地存储，数据仅保留在本次会话中。')
        }
        return
      }
    }
    memory.set(key, value)
    notify('unavailable', '当前环境无法访问本地存储，数据仅保留在本次会话中。')
  },

  removeItem(key: string): void {
    const target = store()
    memory.delete(key)
    if (!target) return
    try {
      target.removeItem(key)
    } catch {
      // 删除失败无需上报，内存副本已清理
    }
  },
}

/** 仅供测试重置模块级状态。 */
export function resetStorageForTest(): void {
  backing = undefined
  memory.clear()
  listeners.clear()
  health = 'ok'
  lastMessage = null
}
