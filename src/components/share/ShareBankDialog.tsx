import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import qrcode from 'qrcode-generator'
import { invoke } from '@tauri-apps/api/core'
import type { ImportedBank } from '../../store/useAppStore'
import { encryptBankPackage, generateSharePassword } from '../../lib/securePackage'
import { downloadBlob } from '../../lib/download'
import { Check, Copy, Download, Share2, Wifi, X } from '../ui/icons'

type EncryptedBankPayload = Awaited<ReturnType<typeof encryptBankPackage>>

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function startLanShare(payload: string, fileName: string): Promise<{ url: string }> {
  return invoke<{ url: string }>('share_start', { payload, fileName })
}

async function stopLanShare(): Promise<void> {
  if (!isDesktop()) return
  await invoke('share_stop')
}

export function ShareBankDialog({
  bank,
  onClose,
}: {
  bank: ImportedBank
  onClose: () => void
}) {
  const [password, setPassword] = useState(() => generateSharePassword())
  const shareKey = `${bank.id}:${password}`
  const [encryptedState, setEncryptedState] = useState<{
    key: string
    payload: EncryptedBankPayload | null
    error: string
    pending: boolean
  }>({ key: '', payload: null, error: '', pending: true })
  const current =
    encryptedState.key === shareKey
      ? encryptedState
      : { key: shareKey, payload: null, error: '', pending: true }
  const payload = current.payload
  const encrypting = current.pending
  const error = current.error
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const desktop = isDesktop()

  useEffect(() => {
    let cancelled = false
    void stopLanShare().catch(() => {})
    encryptBankPackage(bank, password)
      .then((result) => {
        if (cancelled) return
        setEncryptedState({ key: shareKey, payload: result, error: '', pending: false })
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setEncryptedState({
          key: shareKey,
          payload: null,
          error: reason instanceof Error ? reason.message : String(reason),
          pending: false,
        })
      })
    return () => {
      cancelled = true
    }
  }, [bank, password, shareKey])

  useEffect(() => {
    return () => {
      void stopLanShare().catch(() => {})
    }
  }, [])

  const qrDataUrl = useMemo(() => {
    if (!shareUrl) return ''
    const qr = qrcode(0, 'M')
    qr.addData(shareUrl)
    qr.make()
    return qr.createDataURL(4, 8)
  }, [shareUrl])

  const regenerate = () => {
    setPassword(generateSharePassword())
    setCopied(false)
    setShareUrl('')
    setShareError('')
  }

  const copyPassword = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const download = () => {
    if (!payload) return
    downloadBlob(
      payload.fileName,
      new Blob([payload.payload], { type: 'application/json;charset=utf-8' }),
    )
  }

  const startShare = async () => {
    if (!payload || sharing) return
    setSharing(true)
    setShareError('')
    try {
      const info = await startLanShare(
        payload.payload,
        `quizchest-${bank.id.replace(/[^a-zA-Z0-9_-]/g, '')}.tiyu.enc.json`,
      )
      setShareUrl(info.url)
    } catch (reason) {
      setShareError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSharing(false)
    }
  }

  const close = () => {
    void stopLanShare().catch(() => {})
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="search-layer" />
        <Dialog.Content className="share-panel" aria-label="分享题库">
          <div className="share-head">
            <div>
              <Dialog.Title className="serif share-title">分享「{bank.title}」</Dialog.Title>
              <p className="share-subtitle">
                生成一个加密题库包。对方导入时需要输入下面的口令，文件和口令请分开传递。
              </p>
            </div>
            <button className="icon-button" onClick={close} aria-label="关闭分享">
              <X />
            </button>
          </div>

          <div className="share-password">
            <div>
              <span className="share-label">一次性分享口令</span>
              <code className="mono">{password}</code>
            </div>
            <div className="share-password-actions">
              <button className="button button-ghost button-sm" onClick={() => void copyPassword()}>
                {copied ? <Check /> : <Copy />} {copied ? '已复制' : '复制'}
              </button>
              <button className="button button-ghost button-sm" onClick={regenerate}>
                换一个
              </button>
            </div>
          </div>

          {encrypting ? (
            <div className="share-state">
              <span className="share-spinner" aria-hidden="true" />
              正在用 AES-256-GCM 加密…
            </div>
          ) : error ? (
            <p className="import-error" role="alert">
              {error}
            </p>
          ) : payload ? (
            <>
              <div className="share-actions">
                <button className="button button-primary" onClick={download}>
                  <Download /> 下载加密题库包
                </button>
                {desktop ? (
                  <button className="button button-ghost" onClick={() => void startShare()} disabled={sharing}>
                    <Wifi /> {sharing ? '正在开启…' : '在局域网分享'}
                  </button>
                ) : (
                  <span className="share-platform-note">
                    <Share2 /> 局域网直传仅在桌面端可用；手机端可先下载，再通过系统分享发送。
                  </span>
                )}
              </div>

              {shareError ? (
                <p className="import-error" role="alert">
                  {shareError}
                </p>
              ) : null}

              {shareUrl ? (
                <div className="share-lan">
                  {qrDataUrl ? <img src={qrDataUrl} alt="局域网分享二维码" width={148} height={148} /> : null}
                  <div>
                    <span className="share-label">手机扫码下载</span>
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="share-link">
                      {shareUrl}
                    </a>
                    <small>链接 10 分钟内有效，关闭本窗口即停止。手机需与电脑在同一 Wi-Fi。</small>
                  </div>
                </div>
              ) : null}

              <p className="share-foot">
                文件后缀为 .tiyu.enc.json。加密参数为 PBKDF2-SHA256（310,000 次）与
                AES-256-GCM；口令不写入文件，也不会上传。
              </p>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
