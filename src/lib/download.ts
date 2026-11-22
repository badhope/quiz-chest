/**
 * 浏览器下载的唯一入口。
 *
 * CSV、题库包、全量备份原来各写一遍 Blob + a[download] + revokeObjectURL，
 * 其中一处忘了回收就会把整份文件留在内存里。这里统一处理临时链接的生命周期。
 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(
  fileName: string,
  text: string,
  type: string,
): void {
  downloadBlob(fileName, new Blob([text], { type }))
}
