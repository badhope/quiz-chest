// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachRepositoryForTest, useAppStore } from './useAppStore'
import { createMemoryRepository } from '../services/dataLayer'
import { DEFAULT_SETTINGS } from '../services/repository'

function reset(): void {
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    favorites: ['keep-me'],
    wrongBook: {},
    history: [],
    daily: {},
    lastCollectionId: 'bank-old',
    banks: [],
    banksVersion: 7,
    papers: [],
    pendingSession: null,
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('备份恢复的失败边界', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('replaceAll 失败时内存状态保持原样，不谎称已替换', async () => {
    const repo = createMemoryRepository()
    repo.replaceAll = async () => {
      throw new Error('磁盘已满')
    }
    attachRepositoryForTest(repo)

    await expect(
      useAppStore.getState().restoreBackup({
        settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
        favorites: ['from-backup'],
        wrongBook: {},
        history: [],
        daily: {},
        banks: [],
        papers: [],
      }),
    ).rejects.toThrow('磁盘已满')

    const state = useAppStore.getState()
    expect(state.settings.theme).toBe('light')
    expect(state.favorites).toEqual(['keep-me'])
    expect(state.lastCollectionId).toBe('bank-old')
    expect(state.banksVersion).toBe(7)
    expect(state.persistenceError).toContain('磁盘已满')
  })
})
