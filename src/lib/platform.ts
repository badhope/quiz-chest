import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

/** Capacitor 壳（Android / iOS），不含 Tauri 和浏览器。 */
export function isNativeMobile(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * 把应用主题同步给浏览器地址栏和 Android 系统栏。
 *
 * Capacitor 8 的 SystemBars 是内置插件，不需要额外安装 status-bar。
 * Light 表示浅色底 + 深色图标；Dark 表示深色底 + 浅色图标。
 */
export function syncSystemChrome(theme: 'light' | 'dark'): void {
  const color = theme === 'dark' ? '#121615' : '#f4f0e7'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', color)

  if (!isNativeMobile()) return

  void SystemBars.setStyle({
    style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch(() => {
    // 系统栏不可用时不应影响页面渲染，主题本身已经由 CSS 变量生效。
  })
}
