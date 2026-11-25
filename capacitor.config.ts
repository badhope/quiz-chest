import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tixing.offline.ai',
  appName: '题小星',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f0e7',
  },
  plugins: {
    // Capacitor 8 的系统栏插件：把刘海/手势区尺寸以 CSS 变量交给页面，
    // 页面再用 --safe-top / --safe-bottom 统一预留，避免双重或缺失留白。
    SystemBars: {
      style: 'LIGHT',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
