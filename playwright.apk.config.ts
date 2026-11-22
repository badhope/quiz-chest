import { defineConfig, devices } from '@playwright/test'

/**
 * APK 运行时验证配置。
 *
 * 宿主没有硬件虚拟化（无 VT-x），Android 模拟器起不来。这里做能做的最强
 * 替代：解包 APK 里的真实前端资源，由 Chromium 按原生壳的方式（hash 路由、
 * 手机视口）加载并跑关键链路。验证的是 APK 内容本身，不是 dist/。
 *
 * 前置：先构建 APK（`pnpm build:apk`），再运行 `pnpm test:e2e:apk`。
 */
export default defineConfig({
  testDir: './e2e/apk',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 5'],
  },
  projects: [{ name: 'apk-pixel5', use: { ...devices['Pixel 5'] } }],
  webServer: {
    command: 'node scripts/serve-apk-assets.mjs',
    url: 'http://127.0.0.1:5183/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
