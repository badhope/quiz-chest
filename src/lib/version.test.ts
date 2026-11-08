import { describe, expect, it } from 'vitest'
import { APP_VERSION, isStableVersion, versionLabel } from './version'

describe('version', () => {
  it('exposes the injected app version', () => {
    expect(APP_VERSION).toBe('0.0.0-test')
  })

  it('distinguishes stable from pre-release versions', () => {
    expect(isStableVersion('1.2.3')).toBe(true)
    expect(isStableVersion('1.2.3-beta.1')).toBe(false)
    expect(isStableVersion('1.2')).toBe(false)
  })

  it('formats the display label with a v prefix', () => {
    expect(versionLabel('1.2.3')).toBe('v1.2.3')
    expect(versionLabel('2.0.0-rc.1')).toBe('v2.0.0-rc.1')
  })
})
