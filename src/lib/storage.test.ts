// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorageHealth, onStorageHealth, resetStorageForTest, resilientStorage } from './storage'

describe('resilientStorage', () => {
  beforeEach(() => {
    resetStorageForTest()
  })

  it('round-trips values through localStorage when available', () => {
    resilientStorage.setItem('k', 'v')
    expect(resilientStorage.getItem('k')).toBe('v')
    expect(getStorageHealth().health).toBe('ok')
  })

  it('falls back to memory when localStorage write throws a quota error', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        const error = new Error('quota exceeded')
        error.name = 'QuotaExceededError'
        throw error
      })

    resilientStorage.setItem('k', 'v')

    expect(setItem).toHaveBeenCalled()
    expect(resilientStorage.getItem('k')).toBe('v')
    expect(getStorageHealth().health).toBe('degraded')
  })

  it('reports degraded once and notifies subscribers', () => {
    const listener = vi.fn()
    onStorageHealth(listener)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('quota exceeded')
      error.name = 'QuotaExceededError'
      throw error
    })

    resilientStorage.setItem('a', '1')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toBe('degraded')
  })

  it('recovers to ok after a successful write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementationOnce(() => {
      const error = new Error('quota exceeded')
      error.name = 'QuotaExceededError'
      throw error
    })

    resilientStorage.setItem('a', '1')
    expect(getStorageHealth().health).toBe('degraded')

    resilientStorage.setItem('a', '2')
    expect(getStorageHealth().health).toBe('ok')
  })

  it('removes both the persisted value and the memory copy', () => {
    resilientStorage.setItem('k', 'v')
    resilientStorage.removeItem('k')
    expect(resilientStorage.getItem('k')).toBeNull()
  })
})
