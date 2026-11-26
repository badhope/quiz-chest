// 重新生成 README 的手机界面图。使用 390×844 的 Android 视口与触控模式，
// 不是把桌面截图缩小。需要先用 `pnpm preview` 起 dist/。
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.TIXING_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const out = process.env.TIXING_MOBILE_SHOT_DIR ?? join(tmpdir(), 'tixing-mobile-shots')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await mkdir(out, { recursive: true })

async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/${name}.png` })
}

await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('.home-coach')
await shot('mobile-home')

await page.goto(`${base}/catalog`, { waitUntil: 'networkidle' })
await page.waitForSelector('.tree-page')
await shot('mobile-catalog')

const firstCollection = page.locator('.tree-collection').first()
const href = await firstCollection.getAttribute('href')
if (href) {
  await page.goto(`${base}${href.replace('/collection/', '/study/')}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.study-page')
  await page.getByRole('button', { name: '显示答案' }).click()
  await page.waitForSelector('.study-answer')
  await page.evaluate(() => window.scrollBy(0, 260))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/mobile-study.png` })

  await page.goto(`${base}${href.replace('/collection/', '/practice/')}?mode=practice`, {
    waitUntil: 'networkidle',
  })
  await page.waitForSelector('.question-card')
  await shot('mobile-practice')
}

await page.goto(`${base}/import`, { waitUntil: 'networkidle' })
await page.waitForSelector('.import-page')
await shot('mobile-import')

await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
await page.waitForSelector('.settings-page')
await shot('mobile-settings')

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
await shot('mobile-collection')
const textHref = page.url().replace(base, '')
await page.goto(`${base}${textHref.replace('/collection/', '/practice/')}?mode=practice`, { waitUntil: 'networkidle' })
await page.waitForSelector('.question-card')
await page.getByLabel('填写答案').fill('叶绿体')
await page.getByRole('button', { name: /确认答案/ }).click()
await page.getByRole('button', { name: /下一题/ }).click()
await page.getByLabel('填写简答答案').fill('光照和叶绿体')
await page.getByRole('button', { name: /确认答案/ }).click()
await page.waitForSelector('.analysis')
await page.waitForTimeout(350)
await page.screenshot({ path: `${out}/mobile-practice-text.png` })

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
await shot('mobile-exam-result')


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
await page.screenshot({ path: `${out}/mobile-pdf-import.png` })

await browser.close()
console.log('done', out, href)
