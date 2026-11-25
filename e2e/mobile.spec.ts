import { test, expect, devices } from '@playwright/test'

/**
 * 手机端专项 E2E。
 *
 * 不替代 Android 真机，但覆盖最容易在桌面测试里漏掉的真实约束：
 * 320px 窄屏、44px 触控热区、刘海安全区、软键盘后的弹层高度、
 * 答题卡遮罩、交卷弹层定位，以及 Android 文件选择器需要的 MIME。
 */
test.use({
  ...devices['Pixel 5'],
  viewport: { width: 320, height: 568 },
  screen: { width: 320, height: 568 },
})

async function pageOverflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test('窄屏首页没有横向溢出，顶栏与底栏满足触控尺寸', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.mobile-nav')).toBeVisible()
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

  const icon = await page.locator('.topbar .icon-button').first().boundingBox()
  expect(icon?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(icon?.height ?? 0).toBeGreaterThanOrEqual(44)

  const navItems = page.locator('.mobile-nav-item')
  expect(await navItems.count()).toBe(6)
  for (const item of await navItems.all()) {
    const box = await item.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  // 侧栏是抽屉，初始不能占住屏幕。
  const sidebar = await page.locator('.sidebar').boundingBox()
  expect(sidebar?.right ?? 0).toBeLessThanOrEqual(0)
})

test('题库页工具条在 320px 下纵向铺满，搜索框不再被压扁', async ({ page }) => {
  await page.goto('/catalog')
  const search = page.locator('.tree-search')
  const importButton = page.locator('.tree-head-actions .button')
  const searchBox = await search.boundingBox()
  const importBox = await importButton.boundingBox()

  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(270)
  expect(importBox?.width ?? 0).toBeGreaterThanOrEqual(270)
  expect(importBox?.y ?? 0).toBeGreaterThan(searchBox?.y ?? 0)

  const inputFont = await search.locator('input').evaluate((el) => getComputedStyle(el).fontSize)
  expect(parseFloat(inputFont)).toBeGreaterThanOrEqual(16)

  await search.locator('input').fill('高数')
  await expect(search.locator('input')).toHaveValue('高数')
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
})

test('题库详情页底栏高亮题库，而不是全部熄灭', async ({ page }) => {
  await page.goto('/collection/calculus')
  const active = page.locator('.mobile-nav-item.active')
  await expect(active).toHaveCount(1)
  await expect(active).toContainText('题库')
})

test('答题页顶栏保持单行标题，进度条不再压在顶栏下面', async ({ page }) => {
  await page.goto('/practice/calculus?mode=practice')
  await expect(page.locator('.practice-mode')).toBeHidden()

  const topbar = await page.locator('.practice-topbar').boundingBox()
  const progress = await page.locator('.practice-progress').boundingBox()
  expect(topbar?.height ?? 999).toBeLessThanOrEqual(66)
  expect(progress?.y ?? 0).toBeGreaterThanOrEqual((topbar?.y ?? 0) + (topbar?.height ?? 0) - 1)

  const title = await page.locator('.practice-title strong').boundingBox()
  expect(title?.width ?? 0).toBeGreaterThan(50)
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

  // 操作栏改成横向 sticky，不再纵向占掉半屏。
  const actions = await page.locator('.question-actions').evaluate((el) => {
    const style = getComputedStyle(el)
    return { direction: style.flexDirection, sticky: style.position }
  })
  expect(actions.direction).toBe('row')
  expect(actions.sticky).toBe('sticky')
})

test('答题卡抽屉有遮罩，点遮罩可以关闭', async ({ page }) => {
  await page.goto('/practice/calculus?mode=practice')
  await page.locator('.practice-outline-toggle').tap()
  await expect(page.locator('.practice-outline-scrim')).toBeVisible()
  await expect(page.locator('.practice-shell')).toHaveClass(/outline-open/)

  const scrim = await page.locator('.practice-outline-scrim').boundingBox()
  expect(scrim?.width ?? 0).toBe(320)
  expect(scrim?.height ?? 0).toBe(568)

  await page.locator('.practice-outline-scrim').tap({ position: { x: 20, y: 20 } })
  await expect(page.locator('.practice-shell')).not.toHaveClass(/outline-open/)
})

test('交卷确认框从第一帧起就留在视口内，不会先闪到屏幕外', async ({ page }) => {
  await page.goto('/practice/calculus?mode=practice')
  await page.locator('.option').first().tap()
  await page.locator('.practice-submit').tap()

  await expect(page.locator('.confirm-card')).toBeVisible()
  for (const delay of [40, 120, 260]) {
    await page.waitForTimeout(delay === 40 ? 40 : delay - (delay === 120 ? 40 : 120))
    const box = await page.locator('.confirm-card').boundingBox()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320)
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568)
  }
})

test('搜索弹层在移动端使用移动文案，缩小视口后仍不越界', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '搜索题库、考点、题目' }).tap()
  await expect(page.locator('.search-panel')).toBeVisible()
  await expect(page.locator('.search-foot-mobile')).toBeVisible()
  await expect(page.locator('.search-foot-desktop').first()).toBeHidden()

  const inputFont = await page
    .locator('.search-input-row input')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(parseFloat(inputFont)).toBeGreaterThanOrEqual(16)

  // 模拟软键盘弹出后布局视口变矮。
  await page.setViewportSize({ width: 320, height: 300 })
  await page.waitForTimeout(80)
  const panel = await page.locator('.search-panel').boundingBox()
  expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(300 + 1)
})

test('模拟刘海安全区时顶栏和底栏自动让位', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({
    content: ':root { --safe-area-inset-top: 24px; --safe-area-inset-bottom: 18px; }',
  })
  await page.waitForTimeout(50)

  const topbar = page.locator('.topbar')
  await expect
    .poll(() => topbar.evaluate((el) => getComputedStyle(el).paddingTop))
    .toBe('24px')
  await expect
    .poll(() => topbar.evaluate((el) => getComputedStyle(el).height))
    .toBe('84px')

  const navPadding = await page
    .locator('.mobile-nav')
    .evaluate((el) => getComputedStyle(el).paddingBottom)
  expect(parseFloat(navPadding)).toBeGreaterThanOrEqual(18)
})

test('导入页文件选择器包含 Android 常见 MIME，输入框不触发缩放', async ({ page }) => {
  await page.goto('/import')
  const input = page.locator('input[type=file]').first()
  const accept = (await input.getAttribute('accept')) ?? ''
  expect(accept).toContain('application/json')
  expect(accept).toContain('text/csv')
  expect(accept).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  expect(accept).toContain('application/octet-stream')

  const font = await page
    .locator('.import-textarea')
    .evaluate((el) => getComputedStyle(el).fontSize)
  expect(parseFloat(font)).toBeGreaterThanOrEqual(16)
})

test('手机视口下仍能导出备份', async ({ page }) => {
  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出备份' }).tap(),
  ])
  expect(download.suggestedFilename()).toMatch(/^tixing-backup-.*\.json$/)
})

test('横屏 844×390 不产生整页横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/practice/calculus?mode=practice')
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
  // 练习是沉浸式路由，没有底部导航；横屏应保留完整答题区。
  await expect(page.locator('.practice-shell')).toBeVisible()
  await expect(page.locator('.practice-topbar')).toBeVisible()
})
