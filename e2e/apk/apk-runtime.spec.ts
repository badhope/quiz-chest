import { test, expect } from '@playwright/test'
import { readStores } from '../helpers'

/**
 * APK 运行时验证。
 *
 * 跑在 `scripts/serve-apk-assets.mjs` 供出的真实 APK 资源上（hash 路由），
 * 用 Pixel 5 视口模拟手机。验证的是「装到手机上的那个包」能不能完成
 * 核心闭环，而不是 dist/ 或 dev server。
 */

const CSV = `title,stem,optionA,optionB,optionC,optionD,answer,explanation,type
APK 验证题库,一年有多少个月,10,11,12,13,C,一年十二个月,single
APK 验证题库,下列哪些是偶数,1,2,3,4,B;D,能被 2 整除的是偶数,multiple`

test('APK 资源可启动：首页渲染，移动端底部导航可见', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: /不用先想清楚练什么/ })).toBeVisible()
  // Pixel 5 视口下使用底部导航；桌面侧栏是「移出屏幕待命」而非 display:none，
  // 所以断言它在视口左侧之外，而不是不可见。
  await expect(page.locator('.mobile-nav')).toBeVisible()
  const offCanvas = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return false
    return sidebar.getBoundingClientRect().right <= 0
  })
  expect(offCanvas).toBe(true)
})

test('导入题库并跨刷新持久化（IndexedDB）', async ({ page }) => {
  await page.goto('/#/import')
  await expect(page.getByRole('heading', { name: '把你自己的题目带进来' })).toBeVisible()
  await page.getByRole('textbox', { name: '粘贴 JSON 内容' }).fill(CSV)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 \d+ 题/ })).toBeVisible()

  const before = await readStores(page)
  expect(before.banks.map((bank) => bank.title)).toContain('APK 验证题库')

  await page.reload()
  await page.goto('/#/library')
  await expect(page.getByRole('heading', { name: '导入的题库都住在这里' })).toBeVisible()
  await expect(page.getByText('APK 验证题库').first()).toBeVisible()

  const after = await readStores(page)
  expect(after.banks.map((bank) => bank.title)).toContain('APK 验证题库')
})

test('答题答错进错题本，交卷生成记录', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByRole('textbox', { name: '粘贴 JSON 内容' }).fill(CSV)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 \d+ 题/ })).toBeVisible()

  await page.goto('/#/library')
  await page.getByRole('link', { name: 'APK 验证题库', exact: true }).first().click()
  await page.getByRole('link', { name: /顺序练习/ }).click()

  // 第 1 题正确答案是 C，故意选 A
  await expect(page.getByRole('group', { name: '选项' })).toBeVisible()
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.getByText('回答错误')).toBeVisible()

  const stores = await readStores(page)
  expect(stores.wrong).toHaveLength(1)
  expect(stores.wrong[0].wrongCount).toBe(1)
})

test('设置页显示 IndexedDB 驱动', async ({ page }) => {
  await page.goto('/#/settings')
  await expect(page.getByText('本地数据库')).toBeVisible()
  await expect(page.getByText('indexeddb', { exact: true })).toBeVisible()
})
