// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Root } from './Root'
import { useAppStore, attachRepositoryForTest } from './store/useAppStore'
import type { Repository } from './services/repository'

vi.mock('./hooks/useServiceWorker', () => ({ useServiceWorker: () => {} }))
vi.mock('./App', () => ({ App: () => <div>应用已就绪</div> }))

function brokenRepository(message: string): Repository {
  return {
    driver: 'sqlite',
    location: '测试库',
    load: () => Promise.reject(new Error(message)),
    saveSettings: () => Promise.resolve(),
    setLastCollection: () => Promise.resolve(),
    setPendingSession: () => Promise.resolve(),
    addBankSnapshot: () => Promise.resolve(),
    removeBankSnapshot: () => Promise.resolve(),
    clearBankSnapshots: () => Promise.resolve(),
    setFavorite: () => Promise.resolve(),
    clearFavorites: () => Promise.resolve(),
    recordWrong: () => Promise.resolve(),
    removeWrong: () => Promise.resolve(),
    clearWrongBook: () => Promise.resolve(),
    addHistory: () => Promise.resolve(),
    clearHistory: () => Promise.resolve(),
    upsertBank: () => Promise.resolve(),
    deleteBank: () => Promise.resolve(),
    addPaper: () => Promise.resolve(),
    removePaper: () => Promise.resolve(),
    resetProgress: () => Promise.resolve(),
    replaceAll: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }
}

function reset(): void {
  useAppStore.setState({
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('Root 启动错误页', () => {
  it('数据库打不开时展示错误，而不是白屏', async () => {
    reset()
    attachRepositoryForTest(brokenRepository('库文件已损坏'))
    render(<Root />)

    await waitFor(() => {
      expect(screen.getByText('无法打开本地数据库')).toBeTruthy()
    })
    expect(screen.getByText('库文件已损坏')).toBeTruthy()
  })

  it('错误页提供重试、重建与从备份恢复三个出口', async () => {
    reset()
    attachRepositoryForTest(brokenRepository('磁盘已满'))
    render(<Root />)

    await waitFor(() => expect(screen.getByText('无法打开本地数据库')).toBeTruthy())
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '重建空库' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /从备份文件恢复/ })).toBeTruthy()
  })

  it('重试会重新触发 hydrate', async () => {
    reset()
    const load = vi.fn().mockRejectedValue(new Error('仍然失败'))
    const repo: Repository = { ...brokenRepository('x'), load }
    attachRepositoryForTest(repo)
    const user = userEvent.setup()
    render(<Root />)

    await waitFor(() => expect(screen.getByText('无法打开本地数据库')).toBeTruthy())
    expect(load).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })
})
