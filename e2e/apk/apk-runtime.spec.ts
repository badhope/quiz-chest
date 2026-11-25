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
  await expect(page.getByText('32 个题库 · 641 道题')).toBeVisible()
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
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(CSV)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 \d+ 题/ })).toBeVisible()

  const before = await readStores(page)
  expect(before.banks.map((bank) => bank.title)).toContain('APK 验证题库')

  await page.reload()
  await page.goto('/#/catalog')
  await page.getByRole('textbox', { name: '搜索题库' }).fill('APK 验证题库')
  await expect(page.locator('.tree-search-row').filter({ hasText: 'APK 验证题库' }).first()).toBeVisible()

  const after = await readStores(page)
  expect(after.banks.map((bank) => bank.title)).toContain('APK 验证题库')
})

test('答题答错进错题本，交卷生成记录', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(CSV)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 \d+ 题/ })).toBeVisible()

  await page.goto('/#/catalog')
  await page.getByRole('textbox', { name: '搜索题库' }).fill('APK 验证题库')
  await page.locator('.tree-search-row').filter({ hasText: 'APK 验证题库' }).first().click()
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

test('APK 资源可导入并作答填空题', async ({ page }) => {
  const TEXT = `# APK 文本题

1. 光合作用的场所是？【填空题】
答案：叶绿体|叶绿体。
解析：叶绿体含有叶绿素，是光合作用的场所。
`
  await page.goto('/#/import')
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(TEXT)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 1 题/ }).click()
  await page.getByRole('link', { name: /打开这个题库/ }).click()
  await page.getByRole('link', { name: /顺序练习/ }).click()
  await page.getByLabel('填写答案').fill('叶绿体')
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.getByText('填写正确')).toBeVisible()
  const stores = await readStores(page)
  expect(stores.banks.find((bank) => bank.title === 'APK 文本题')?.questions[0].answerText).toEqual(['叶绿体', '叶绿体。'])
  expect(stores.wrong).toHaveLength(0)
})

test('APK 资源内模拟考试按题型结算', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(CSV)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await page.getByRole('link', { name: /打开这个题库/ }).click()
  await page.getByRole('link', { name: /模拟考试/ }).click()

  await page.getByRole('button', { name: /^C 12$/ }).click()
  await page.getByRole('button', { name: /下一题/ }).click()
  await page.getByRole('button', { name: /^B 2$/ }).click()
  await page.getByRole('button', { name: /^D 4$/ }).click()
  await page.getByRole('button', { name: /完成练习/ }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()

  await expect(page.getByRole('heading', { name: '过线了' })).toBeVisible()
  await expect(page.locator('.result-score')).toContainText('5')
  await expect(page.locator('.exam-type-row').filter({ hasText: '多选题' }).locator('.exam-type-score')).toHaveText('3 / 3')
  const stores = await readStores(page)
  expect(stores.history[0].exam).toMatchObject({ score: 5, fullScore: 5, passScore: 3, passed: true })
})

test('设置页显示 IndexedDB 驱动', async ({ page }) => {
  await page.goto('/#/settings')
  await expect(page.getByText('本地数据库')).toBeVisible()
  await expect(page.getByText('indexeddb', { exact: true })).toBeVisible()
})
