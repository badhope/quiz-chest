// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  getUri: vi.fn(),
  share: vi.fn(),
}))

vi.mock('./platform', () => ({ isNativeMobile: () => true }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: mocks.writeFile, getUri: mocks.getUri },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }))

import { downloadText } from './download'

describe('原生壳导出', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeFile.mockResolvedValue(undefined)
    mocks.getUri.mockResolvedValue({ uri: 'file:///cache/exports/test.csv' })
    mocks.share.mockResolvedValue({ activityType: 'com.android.documentsui' })
  })

  it('写入缓存目录后调用系统分享，而不是依赖 WebView 的 a[download]', async () => {
    const result = await downloadText('错题/清单.csv', '题干,答案', 'text/csv;charset=utf-8')

    expect(result).toEqual({ ok: true, channel: 'native-share' })
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'exports/错题-清单.csv',
      data: '题干,答案',
      directory: 'CACHE',
      encoding: 'utf8',
      recursive: true,
    })
    expect(mocks.getUri).toHaveBeenCalledWith({
      path: 'exports/错题-清单.csv',
      directory: 'CACHE',
    })
    expect(mocks.share).toHaveBeenCalledWith({
      title: '错题/清单.csv',
      files: ['file:///cache/exports/test.csv'],
      dialogTitle: '保存或分享文件',
    })
  })

  it('写入或分享失败时返回可展示的错误，不静默吞掉', async () => {
    mocks.share.mockRejectedValueOnce(new Error('No activity found'))

    const result = await downloadText('备份.json', '{}', 'application/json')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('No activity found')
  })
})
