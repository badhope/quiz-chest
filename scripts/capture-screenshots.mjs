// 重新生成 README 里的五张界面图。
// 需要本机浏览器与 Playwright 环境；默认用 Playwright 自带 Chromium，
// CI 或容器里可用 PLAYWRIGHT_CHROMIUM_PATH 指定已安装的 Chromium。
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.TIXING_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const out = process.env.TIXING_SHOT_DIR ?? join(tmpdir(), 'tixing-shots')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
})
await mkdir(out, { recursive: true })

await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.home-coach')
await page.screenshot({ path: `${out}/home.png` })

await page.goto(`${base}/catalog`, { waitUntil: 'networkidle' })
await page.waitForSelector('.tree-page')
await page.screenshot({ path: `${out}/catalog.png` })

const firstCollection = page.locator('.tree-collection').first()
const href = await firstCollection.getAttribute('href')
if (href) {
  await page.goto(`${base}${href}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.collection-page')
  await page.screenshot({ path: `${out}/collection.png` })

  await page.goto(`${base}${href.replace('/collection/', '/practice/')}?mode=practice`, {
    waitUntil: 'networkidle',
  })
  await page.waitForSelector('.question-card')
  await page.locator('.option').first().click()
  await page.locator('button', { hasText: '确认答案' }).click()
  await page.waitForSelector('.analysis')
  await page.screenshot({ path: `${out}/practice.png` })

  // 走完 6 道示例题，让统计页有真实作答记录；第 2 题起按正确答案选，
  // 第 1 题故意点错，方便练习页展示解析与错题状态。
  const correctOptions = [1, 3, 1, 2, 1, 0]
  for (let index = 0; index < 6; index += 1) {
    if (index > 0) {
      await page.locator('.option').nth(correctOptions[index]).click()
      await page.locator('button', { hasText: '确认答案' }).click()
      await page.waitForSelector('.analysis')
    }
    const isLast = index === 5
    await page.locator('button', { hasText: isLast ? '完成练习' : '下一题' }).click()
    if (isLast) {
      await page.waitForSelector('.confirm-card')
      await page.locator('button', { hasText: '提交并查看结果' }).click()
      await page.waitForSelector('.result-page')
    } else {
      await page.waitForTimeout(150)
    }
  }
}

await page.goto(`${base}/records?tab=stats`, { waitUntil: 'networkidle' })
await page.waitForSelector('.stats-page')
await page.screenshot({ path: `${out}/stats.png` })

await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
await page.waitForSelector('.settings-page')
await page.screenshot({ path: `${out}/settings.png` })

await browser.close()
console.log('done', href)
