import { useEffect, useRef, useState } from 'react'
import { App } from './App'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useAppStore } from './store/useAppStore'
import { parseBackup } from './lib/backup'
import { getRepository, rebuildDatabase } from './services/dataLayer'
import { normalizeSnapshot } from './services/repository'

/**
 * 启动闸门。
 *
 * 数据来自设备内数据库，首帧在加载完成后渲染，否则会出现「先显示空题库、
 * 随后跳变」的闪烁与错误的空态判定。
 *
 * 加载失败时不能只给一个「重试」：数据库损坏、版本过高、磁盘满这几种情况
 * 重试多少次都不会成功，而设置页（唯一有恢复入口的地方）此时根本进不去。
 * 所以错误页必须自带「从备份文件恢复」，否则用户的数据就真的拿不回来。
 */
export function Root() {
  useServiceWorker()
  const hydrate = useAppStore((state) => state.hydrate)
  const hydration = useAppStore((state) => state.hydration)
  const hydrationError = useAppStore((state) => state.hydrationError)
  const [attempt, setAttempt] = useState(0)
  const [restoreMessage, setRestoreMessage] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate, attempt])

  const onRebuild = async () => {
    if (
      !window.confirm(
        '将把当前数据库文件改名保留（不会删除），并新建一个空库。之后可以用备份文件恢复数据。确定继续？',
      )
    ) {
      return
    }
    setRebuilding(true)
    try {
      const quarantined = await rebuildDatabase()
      setRestoreMessage(
        quarantined
          ? `已重建数据库，原文件保留在：${quarantined}`
          : '当前环境不支持重建数据库。',
      )
      setAttempt((value) => value + 1)
    } catch (error) {
      setRestoreMessage(
        `重建失败：${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setRebuilding(false)
    }
  }

  const onRestore = (file: File | undefined) => {
    if (!file) return
    setRestoring(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const result = parseBackup(String(reader.result ?? ''))
      if (!result.payload) {
        setRestoreMessage(`恢复失败：${result.error}`)
        setRestoring(false)
        return
      }
      try {
        const repository = await getRepository()
        const { data } = result.payload
        await repository.replaceAll(
          normalizeSnapshot({
            settings: data.settings,
            favorites: data.favorites,
            wrongBook: Object.values(data.wrongBook),
            history: data.history,
            daily: Object.values(data.daily),
            lastCollectionId: null,
            banks: data.banks,
            papers: data.papers,
            // 恢复备份不应带回旧机器上做了一半的会话。
            pendingSession: null,
            bankSnapshots: [],
          }),
        )
        setRestoreMessage('恢复成功，正在重新加载…')
        setAttempt((value) => value + 1)
      } catch (error) {
        setRestoreMessage(
          `恢复失败：${error instanceof Error ? error.message : String(error)}。数据库本身可能不可写，请检查磁盘空间或权限。`,
        )
      } finally {
        setRestoring(false)
      }
    }
    reader.onerror = () => {
      setRestoreMessage('读取备份文件失败，请重试。')
      setRestoring(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  if (hydration === 'ready') return <App />

  return (
    <div className="boot-screen" role="status" aria-live="polite">
      {hydration === 'error' ? (
        <>
          <h1 className="serif">无法打开本地数据库</h1>
          <p>{hydrationError}</p>
          <p>
            你的数据仍保留在本机。可以先重试；若数据库已损坏或版本不兼容，重建一个空库，
            再用备份文件恢复。原数据库文件会改名保留，不会被删除。
          </p>
          <div className="boot-actions">
            <button className="button" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </button>
            <button
              className="button button-ghost"
              disabled={rebuilding}
              onClick={() => void onRebuild()}
            >
              {rebuilding ? '正在重建…' : '重建空库'}
            </button>
            <button
              className="button button-primary"
              disabled={restoring}
              onClick={() => fileRef.current?.click()}
            >
              {restoring ? '正在恢复…' : '从备份文件恢复'}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={(event) => {
              onRestore(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {restoreMessage ? <p className="boot-note">{restoreMessage}</p> : null}
        </>
      ) : (
        <>
          <h1 className="serif">题匣</h1>
          <p>正在加载本地题库…</p>
        </>
      )}
    </div>
  )
}
