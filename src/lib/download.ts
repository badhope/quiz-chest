import { isNativeMobile } from './platform'

export type DownloadChannel = 'browser' | 'native-share'

export type DownloadResult =
  | { ok: true; channel: DownloadChannel }
  | { ok: false; error: string }

/** 文件名会进入 Android 缓存目录，先去掉路径分隔符和非法字符。 */
function safeFileName(fileName: string): string {
  const withoutInvalid = fileName.replace(/[\\/:*?"<>|]+/g, '-')
  const cleaned = Array.from(withoutInvalid)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'tixing-export'
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取导出内容失败'))
    reader.readAsText(blob)
  })
}

/**
 * Android WebView 不保证处理 `a[download]` + blob URL，很多机型会静默失败。
 * 原生壳改为写入应用缓存，再交给系统分享面板，用户可选择「保存到文件」、
 * 发送给微信/邮件，或存到网盘。浏览器仍走临时链接。
 */
async function shareOnDevice(fileName: string, blob: Blob): Promise<DownloadResult> {
  try {
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    const path = `exports/${safeFileName(fileName)}`
    await Filesystem.writeFile({
      path,
      data: await readBlobText(blob),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({
      title: fileName,
      files: [uri],
      dialogTitle: '保存或分享文件',
    })
    return { ok: true, channel: 'native-share' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 所有导出（CSV、题库包、完整备份、加密包）的唯一入口。
 *
 * 返回结果而不是抛异常：调用方可以在设置页或分享面板里给用户一句明确反馈，
 * 不会出现「点了导出但什么都没发生」。
 */
export async function downloadBlob(fileName: string, blob: Blob): Promise<DownloadResult> {
  if (isNativeMobile()) return shareOnDevice(fileName, blob)

  try {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = safeFileName(fileName)
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { ok: true, channel: 'browser' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function downloadText(
  fileName: string,
  text: string,
  type: string,
): Promise<DownloadResult> {
  return downloadBlob(fileName, new Blob([text], { type }))
}
