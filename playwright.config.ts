import { defineConfig, devices } from '@playwright/test'

/**
 * 端到端测试配置。
 *
 * 只覆盖跨组件、跨路由的关键链路：单元测试无法证明「导入的题能真的做、
 * 交卷能进错题本、备份能还原」。刻意不跑多浏览器矩阵——本项目用户主要在
 * Chromium 内核（WebView2 / Android WebView），多装两个浏览器只会拖慢反馈。
 */
export default defineConfig({
  testDir: './e2e',
  // apk/ 下的用例跑在 hash 路由与 Pixel 5 视口上，属于 playwright.apk.config.ts，
  // 在这里跑必然失败（BrowserRouter 下 '/#/import' 打不开导入页）。
  testIgnore: ['**/apk/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
