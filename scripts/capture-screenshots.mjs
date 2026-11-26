// 重新生成 README 里的界面图。
// 需要本机浏览器与 Playwright 环境；默认用 Playwright 自带 Chromium，
// CI 或容器里可用 PLAYWRIGHT_CHROMIUM_PATH 指定已安装的 Chromium。
import { chromium, expect } from '@playwright/test'
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

  await page.goto(`${base}${href.replace('/collection/', '/study/')}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.study-page')
  await page.getByRole('button', { name: '显示答案' }).click()
  await page.waitForSelector('.study-answer')
  await page.screenshot({ path: `${out}/study.png` })

  await page.goto(`${base}${href.replace('/collection/', '/practice/')}?mode=practice`, {
    waitUntil: 'networkidle',
  })
  await page.waitForSelector('.question-card')
  await page.locator('.option').first().click()
  await page.locator('button', { hasText: '确认答案' }).click()
  await page.waitForSelector('.analysis')
  await page.screenshot({ path: `${out}/practice.png` })

  // 把当前题库做完再提交，避免题库题量变化后脚本还按固定的 6 题硬走。
  // 每题都点第一个选项，统计页只需要真实作答记录，不追求全对。
  for (let index = 0; index < 40; index += 1) {
    if (index > 0) {
      await page.locator('.option').first().click()
      await page.locator('button', { hasText: '确认答案' }).click()
      await page.waitForSelector('.analysis')
    }
    const finishButton = page.locator('button', { hasText: '完成练习' })
    if (await finishButton.count()) {
      await finishButton.click()
      await page.waitForSelector('.confirm-card')
      await page.locator('button', { hasText: '提交并查看结果' }).click()
      await page.waitForSelector('.result-page')
      break
    }
    await page.locator('button', { hasText: '下一题' }).click()
    await page.waitForTimeout(150)
  }
}

await page.goto(`${base}/import`, { waitUntil: 'networkidle' })
await page.waitForSelector('.import-page')
await page.screenshot({ path: `${out}/import.png` })

await page.goto(`${base}/records?tab=stats`, { waitUntil: 'networkidle' })
await page.waitForSelector('.stats-page')
await page.screenshot({ path: `${out}/stats.png` })

await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
await page.waitForSelector('.settings-page')
await page.screenshot({ path: `${out}/settings.png` })

// 文本题不依赖内置题库，现场导入一份，保证截图里是真实的填空/简答链路。
const textBank = `# 文本题演示

1. 光合作用的场所是？【填空题】
答案：叶绿体|叶绿体。
解析：叶绿体含有叶绿素，是光合作用的场所。

2. 光合作用需要哪两个条件？【简答题】
参考答案：光照和叶绿体。
关键词：光照|叶绿体
解析：光照提供能量，叶绿体完成反应。
`
await page.goto(`${base}/import`, { waitUntil: 'networkidle' })
await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(textBank)
await page.getByRole('button', { name: /校验并预览/ }).click()
await expect(page.getByRole('heading', { name: '文本题演示' })).toBeVisible()
await page.getByRole('button', { name: /确认导入 2 题/ }).click()
await page.getByRole('link', { name: /打开这个题库/ }).click()
await page.waitForSelector('.collection-page')
const textHref = page.url().replace(base, '')
await page.goto(`${base}${textHref.replace('/collection/', '/practice/')}?mode=practice`, {
  waitUntil: 'networkidle',
})
await page.waitForSelector('.question-card')
await page.getByLabel('填写答案').fill('叶绿体')
await page.getByRole('button', { name: /确认答案/ }).click()
await page.waitForSelector('.analysis')
await page.waitForTimeout(350)
await page.getByRole('button', { name: /下一题/ }).click()
await page.getByLabel('填写简答答案').fill('光照和叶绿体')
await page.getByRole('button', { name: /确认答案/ }).click()
await page.waitForSelector('.analysis')
await page.waitForTimeout(350)
await page.screenshot({ path: `${out}/practice-text.png` })

// 模考结算不依赖内置题库：现场导入一份含四种题型的卷子，全部答对，
// 让截图里的分数、及格线和题型拆分都来自真实交卷。
const examBank = `# 模考演示

1. 一年有多少个月？【单选题】
A. 10
B. 11
C. 12
D. 13
答案：C
解析：一年十二个月。

2. 下列哪些是偶数？【多选题】
A. 1
B. 2
C. 3
D. 4
答案：B、D
解析：能被 2 整除的是偶数。

3. 地球是平的。【判断题】
答案：错误
解析：地球是球体。

4. 水的化学式是？【填空题】
答案：H2O
解析：一个氧原子和两个氢原子。
`
await page.goto(`${base}/import`, { waitUntil: 'networkidle' })
await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(examBank)
await page.getByRole('button', { name: /校验并预览/ }).click()
await expect(page.getByRole('heading', { name: '模考演示' })).toBeVisible()
await page.getByRole('button', { name: /确认导入 4 题/ }).click()
await page.getByRole('link', { name: /打开这个题库/ }).click()
await page.getByRole('link', { name: /模拟考试/ }).click()
await page.waitForSelector('.question-card')
await page.getByRole('button', { name: /^C 12$/ }).click()
await page.getByRole('button', { name: /下一题/ }).click()
await page.getByRole('button', { name: /^B 2$/ }).click()
await page.getByRole('button', { name: /^D 4$/ }).click()
await page.getByRole('button', { name: /下一题/ }).click()
await page.getByRole('button', { name: /^B 错误$/ }).click()
await page.getByRole('button', { name: /下一题/ }).click()
await page.getByLabel('填写答案').fill('H2O')
await page.getByRole('button', { name: /完成练习/ }).click()
await page.getByRole('button', { name: '提交并查看结果' }).click()
await page.waitForSelector('.result-page')
await page.waitForSelector('.exam-report')
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/exam-result.png` })


// PDF 导入截图：用浏览器打印一份真实 PDF，再走文件上传，不用假的 DOM 预览。
const pdfPage = await browser.newPage()
await pdfPage.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:24mm;font-family:"Noto Sans CJK SC",sans-serif;font-size:12pt;line-height:1.65}
h1{font-size:16pt;margin:0 0 8mm}p{margin:0}.q{margin:0 0 6mm}
</style></head><body>
<h1># PDF 导入演示</h1>
<div class="q"><p>1. 一年有多少个月？</p><p>A. 10</p><p>B. 11</p><p>C. 12</p><p>D. 13</p><p>答案：C</p><p>解析：一年十二个月。</p></div>
<div class="q"><p>2. 光合作用的场所是？【填空题】</p><p>答案：叶绿体|叶绿体。</p><p>解析：叶绿体含有叶绿素，是光合作用的场所。</p></div>
</body></html>`, { waitUntil: 'load' })
const pdfBuffer = await pdfPage.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
await pdfPage.close()
await page.goto(`${base}/import`, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type="file"]', { name: 'PDF 导入演示.pdf', mimeType: 'application/pdf', buffer: pdfBuffer })
await page.getByRole('heading', { name: 'PDF 导入演示' }).waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/pdf-import.png` })

await browser.close()
console.log('done', href)
