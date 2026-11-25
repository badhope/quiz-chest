import { test, expect, type Page } from '@playwright/test'
import { readStores as readStoresFromPage } from './helpers'
import { buildXlsx } from './xlsxFixture'
import { strToU8, zipSync } from 'fflate'

/**
 * 关键路径 E2E。
 *
 * 单元测试证明不了跨路由的真实链路：数据是不是真的写进 IndexedDB、
 * 交卷会不会进错题本、备份导出后能不能还原。这里只覆盖这些，
 * 不复刻单元测试已覆盖的判分细节。
 */

const CSV = `title,stem,optionA,optionB,optionC,optionD,answer,explanation,type
E2E 题库,一年有多少个月,10,11,12,13,C,一年十二个月,single
E2E 题库,下列哪些是偶数,1,2,3,4,B;D,能被 2 整除的是偶数,multiple`

async function importCsv(page: Page, csv = CSV, title = 'E2E 题库') {
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: '把你自己的题目带进来' })).toBeVisible()
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(csv)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  // 同名题库会先出现覆盖/新建选择；默认「覆盖原题库」即可。
  await page.getByRole('button', { name: /确认导入 \d+ 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 \d+ 题/ })).toBeVisible()
}

/** 从题库总览搜索并进入某个题库详情。我的题库已并入总览，不再单独开页。 */
async function openBank(page: Page, title = 'E2E 题库') {
  await page.goto('/catalog')
  await page.getByRole('textbox', { name: '搜索题库' }).fill(title)
  await page.locator('.tree-search-row').filter({ hasText: title }).first().click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

/** 读取 IndexedDB，确认数据真的落库而不是只留在内存。实现见 e2e/helpers.ts。 */
const readStores = readStoresFromPage

test('导入题库后数据写入 IndexedDB，刷新后仍在', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')

  const before = await readStores(page)
  expect(before.banks.map((bank) => bank.title)).toContain('E2E 题库')

  await page.reload()
  await page.goto('/catalog')
  await page.getByRole('textbox', { name: '搜索题库' }).fill('E2E 题库')
  await expect(page.locator('.tree-search-row').filter({ hasText: 'E2E 题库' }).first()).toBeVisible()
})

test('难度题作答后错题进错题本，答对的题不进', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')

  // 打开题库详情 → 顺序练习
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()

  // 第 1 题：正确答案是 C，故意选 A
  await expect(page.getByRole('group', { name: '选项' })).toBeVisible()
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.getByText('回答错误')).toBeVisible()

  const afterWrong = await readStores(page)
  expect(afterWrong.wrong).toHaveLength(1)
  expect(afterWrong.wrong[0].wrongCount).toBe(1)

  // 第 2 题：多选 B、D 是正确答案
  await page.getByRole('button', { name: /下一题/ }).click()
  await page.getByRole('button', { name: /^B 2$/ }).click()
  await page.getByRole('button', { name: /^D 4$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.getByText('回答正确')).toBeVisible()

  // 正确作答不应新增错题
  const afterCorrect = await readStores(page)
  expect(afterCorrect.wrong).toHaveLength(1)
})

test('交卷后生成记录并计入每日统计', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()

  await page.getByRole('button', { name: /^C 12$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()

  await expect(page.getByText(/最近一次记录已保存/)).toBeVisible()

  const stores = await readStores(page)
  expect(stores.history.length).toBeGreaterThan(0)
  expect(stores.history[0].accuracy).toBeGreaterThan(0)
})

test('收藏与取消收藏同步到数据库', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()

  await page.getByRole('button', { name: '收藏本题' }).click()
  await expect.poll(async () => (await readStores(page)).favorites.length).toBe(1)

  await page.getByRole('button', { name: '取消收藏' }).click()
  await expect.poll(async () => (await readStores(page)).favorites.length).toBe(0)
})

test('备份导出后清空，再恢复能回到原状态', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()

  await page.goto('/settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出备份/ }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  // 清空学习数据（保留题库），错题应归零
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重置' }).click()
  await expect.poll(async () => (await readStores(page)).wrong.length).toBe(0)

  // 恢复
  await page.setInputFiles('input[type="file"][accept*="json"]', path!)
  await expect(page.getByText(/恢复成功/)).toBeVisible()

  const restored = await readStores(page)
  expect(restored.wrong).toHaveLength(1)
  expect(restored.banks.map((bank) => bank.title)).toContain('E2E 题库')
})

test('搜索框 Esc 关闭并把焦点还给触发按钮', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /搜索题库、考点、题目/ }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '搜索题库' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Tab 不会跑出模态对话框', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /搜索题库、考点、题目/ }).first().click()
  const dialog = page.getByRole('dialog', { name: '搜索题库' })
  await expect(dialog).toBeVisible()

  // 连按 Tab 超过对话框里可聚焦元素的数量，焦点仍必须在框内
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab')
  }
  const inside = await page.evaluate(() => {
    const active = document.activeElement
    const panel = document.querySelector('[role="dialog"][aria-label="搜索题库"]')
    return !!panel && !!active && panel.contains(active)
  })
  expect(inside).toBe(true)
})

test('删除题库会一并清掉它的错题与收藏', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()

  // 制造一条错题和一条收藏
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await page.getByRole('button', { name: '收藏本题' }).click()
  await expect.poll(async () => (await readStores(page)).wrong.length).toBe(1)
  await expect.poll(async () => (await readStores(page)).favorites.length).toBe(1)

  // 回题库详情删除：管理动作已从「我的题库」页并到详情页
  await page.goto('/catalog')
  page.getByRole('textbox', { name: '搜索题库' }).fill('E2E 题库')
  await page.locator('.tree-search-row').filter({ hasText: 'E2E 题库' }).first().click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /删除题库/ }).click()

  const after = await readStores(page)
  expect(after.banks.map((bank) => bank.title)).not.toContain('E2E 题库')
  expect(after.wrong).toHaveLength(0)
  expect(after.favorites).toHaveLength(0)

  // 设置页的计数也必须归零，不能把孤儿行算进去
  await page.goto('/settings')
  await expect(page.getByText('错题').first()).toBeVisible()
})

test('组卷后可打印试卷，卷面不含答案', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await page.goto('/compose')
  await page.getByRole('button', { name: /E2E 题库/ }).click()
  await page.getByRole('button', { name: '打印试卷' }).click()

  // 卷面结构：标题、题号、选项，但默认不显示答案
  await expect(page.getByRole('heading', { name: /E2E 题库 · 自定义卷/ })).toBeVisible()
  await expect(page.getByText('姓名：__________')).toBeVisible()
  await expect(page.getByText('答案：')).toHaveCount(0)
  await expect(page.getByText('（单选题，4 个选项）').first()).toBeVisible()
})

test('打印页可切换附带答案与解析', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await page.goto('/compose')
  await page.getByRole('button', { name: /E2E 题库/ }).click()
  await page.getByRole('button', { name: '打印试卷' }).click()

  await page.getByRole('checkbox', { name: '附带答案与解析' }).check()
  await expect(page.getByText(/答案：/).first()).toBeVisible()
  await expect(page.getByText('一年十二个月')).toBeVisible()

  await page.getByRole('checkbox', { name: '附带答案与解析' }).uncheck()
  await expect(page.getByText(/答案：/)).toHaveCount(0)
})

test('打印时导航与工具栏被隐藏', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await page.goto('/compose')
  await page.getByRole('button', { name: /E2E 题库/ }).click()
  await page.getByRole('button', { name: '打印试卷' }).click()

  // 打印样式表里必须有隐藏导航与工具栏的规则
  const rules = await page.evaluate(() => {
    const found = { hidesSidebar: false, hidesToolbar: false, a4: false }
    for (const sheet of Array.from(document.styleSheets)) {
      let list
      try { list = sheet.cssRules } catch { continue }
      if (!list) continue
      for (const rule of Array.from(list)) {
        const text = rule.cssText ?? ''
        if (text.includes('@media print') || (rule as CSSMediaRule).conditionText?.includes('print')) {
          if (text.includes('.sidebar')) found.hidesSidebar = true
          if (text.includes('.no-print')) found.hidesToolbar = true
        }
        if (text.includes('@page') && text.includes('A4')) found.a4 = true
      }
    }
    return found
  })
  expect(rules.hidesSidebar).toBe(true)
  expect(rules.hidesToolbar).toBe(true)
})

test('编辑题库：改题干后保存，数据库同步且 ID 不变', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /编辑题库/ }).click()

  const stemBox = page.getByLabel('第 1 题题干')
  await expect(stemBox).toBeVisible()
  const idBefore = await page.evaluate(() => location.pathname)
  await stemBox.fill('一年有多少个月（改）')
  // 解析过短会被导入规则拦截：解析至少 4 字符。两道题各有同名标签，取第一题的。
  await page.locator('.edit-question').first().getByLabel('解析（至少 4 个字符）').fill('十二个月，校验与导入同一条管线')

  await page.getByRole('button', { name: /保存修改/ }).click()
  await expect(page.getByText('已保存，题库内容与编号均已更新')).toBeVisible()

  const stores = await readStores(page)
  const edited = stores.banks.find((bank) => bank.title === 'E2E 题库')
  expect(edited?.questions[0].stem).toBe('一年有多少个月（改）')
  // 路由没变：还在编辑页，题库 ID 稳定
  expect(await page.evaluate(() => location.pathname)).toBe(idBefore)
})

test('Excel(.xlsx) 文件可直接导入', async ({ page }) => {
  const bytes = buildXlsx([
    ['title', 'stem', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'explanation', 'type'],
    ['Excel 上传卷', '水的化学式是什么', 'H2O', 'CO2', 'O2', 'NaCl', 'A', '水由两个氢一个氧组成', 'single'],
  ])

  await page.goto('/import')
  await page.setInputFiles('input[type="file"]', {
    name: '题库.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  })
  await expect(page.getByRole('heading', { name: 'Excel 上传卷' })).toBeVisible()
  await page.getByRole('button', { name: /确认导入 1 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 1 题/ })).toBeVisible()

  const stores = await readStores(page)
  expect(stores.banks.map((bank) => bank.title)).toContain('Excel 上传卷')
})

test('练习到一半离开，再进来能接着做（断点续做）', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()

  // 第 1 题答错并核对，然后切到第 2 题
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.getByText('回答错误')).toBeVisible()
  await page.getByRole('button', { name: /下一题/ }).click()

  // 等待防抖保存（400ms）落库
  await expect.poll(async () => (await readStores(page)).pendingSession?.index).toBe(1)

  // 离开题库页——相当于中途退出
  await page.goto('/')
  const resume = page.getByRole('link', { name: /继续「E2E 题库」/ })
  await expect(resume).toBeVisible()

  // 回到练习：应停在第 2 题，且第 1 题已核对过（解析直接展开）
  await resume.click()
  await expect(page.getByRole('group', { name: '选项' })).toBeVisible()
  // 第 2 题是多选题；若回到第 1 题会是单选题
  await expect(page.getByText('多选题', { exact: true })).toBeVisible()

  // 交卷后会话被清除
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()
  await expect.poll(async () => (await readStores(page)).pendingSession).toBeNull()
})

test('带配图的题目能导入并渲染图片', async ({ page }) => {
  // 1x1 透明 PNG，内嵌为 data URI，离线可用
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const csv = `title,stem,optionA,optionB,answer,explanation,type,image
图解题库,下图显示了什么,圆形,方形,A,图中是一个圆点,single,${png}`

  await page.goto('/import')
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(csv)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await page.getByRole('button', { name: /确认导入 1 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 1 题/ })).toBeVisible()

  const stores = await readStores(page)
  const bank = stores.banks.find((item) => item.title === '图解题库')
  expect(bank?.questions[0].image).toBe(png)

  // 进入练习页，图片元素必须真的渲染出来且加载成功
  await page.goto('/catalog')
  await page.getByRole('textbox', { name: '搜索题库' }).fill('图解题库')
  await page.locator('.tree-search-row').filter({ hasText: '图解题库' }).first().click()
  await page.getByRole('link', { name: /顺序练习/ }).click()
  const img = page.locator('.question-figure img')
  await expect(img).toBeVisible()
  const loaded = await img.evaluate((element) => {
    const image = element as HTMLImageElement
    return image.complete && image.naturalWidth > 0
  })
  expect(loaded).toBe(true)
})

test('编辑题库会生成历史版本，可回滚', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /编辑题库/ }).click()

  const stemBox = page.getByLabel('第 1 题题干')
  const originalStem = await stemBox.inputValue()

  // 第一次修改并保存
  await stemBox.fill('第一次修改后的题干')
  await page.getByRole('button', { name: /保存修改/ }).click()
  await expect(page.getByText('已保存，题库内容与编号均已更新')).toBeVisible()

  // 历史版本面板出现，含 v1
  await expect(page.getByText(/历史版本（1）/)).toBeVisible()
  await page.locator('.edit-history summary').click()
  await expect(page.getByText('v1', { exact: true })).toBeVisible()

  // 再改一次，历史应变成 2 份
  await stemBox.fill('第二次修改后的题干')
  await page.getByRole('button', { name: /保存修改/ }).click()
  await expect(page.getByText(/历史版本（2）/)).toBeVisible()

  // 历史按时间倒序：v2 存的是「第一次修改后」的内容，v1 是最初的原始内容。
  // 回滚到 v1 应拿回原始题干。
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('.edit-history li').last().getByRole('button', { name: /回滚/ }).click()

  await expect.poll(async () => {
    const stores = await readStores(page)
    const bank = stores.banks.find((item) => item.title === 'E2E 题库')
    return bank?.questions[0].stem
  }).toBe(originalStem)

  // 回滚本身也是「覆盖」，当前内容会被存成新的历史版本。
  const stores = await readStores(page)
  expect(stores.bankSnapshots.length).toBeGreaterThan(0)
  // 回滚前的「第二次修改」应该能在历史里找到，说明回滚可逆
  expect(
    stores.bankSnapshots.some((snapshot) =>
      snapshot.bank.questions.some((question) => question.stem === '第二次修改后的题干'),
    ),
  ).toBe(true)
})

test('分享题库生成加密包，重新导入时必须输入口令', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('button', { name: /分享题库/ }).click()

  const dialog = page.getByRole('dialog', { name: /分享「E2E 题库」/ })
  await expect(dialog).toBeVisible()
  const password = (await dialog.locator('.share-password code').textContent())?.trim() ?? ''
  expect(password.length).toBeGreaterThanOrEqual(8)

  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /下载加密题库包/ }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  await expect(dialog.getByText(/PBKDF2-SHA256/)).toBeVisible()

  await dialog.getByRole('button', { name: '关闭分享' }).click()
  await page.goto('/import')
  await page.setInputFiles('input[type="file"]', path!)
  await expect(page.getByRole('heading', { name: '输入分享口令' })).toBeVisible()

  await page.getByLabel('分享口令').fill(password)
  await page.getByRole('button', { name: /解密并预览/ }).click()
  await expect(page.getByRole('heading', { name: 'E2E 题库' })).toBeVisible()
})

const TEXT_BANK = `# E2E 文本题库

1. 一年有多少个月？
A. 10
B. 11
C. 12
D. 13
答案：C
解析：一年十二个月，这是常识。

2. 下列哪些是偶数？
A. 1
B. 2
C. 3
D. 4
答案：B、D
解析：能被 2 整除的是偶数。
`

async function importText(page: Page, text = TEXT_BANK, title = 'E2E 文本题库') {
  await page.goto('/import')
  await page.getByRole('textbox', { name: '粘贴题库内容' }).fill(text)
  await page.getByRole('button', { name: /校验并预览/ }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: /确认导入 2 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 2 题/ })).toBeVisible()
}

test('题号文本导入 Word/TXT 模板并落库', async ({ page }) => {
  await importText(page)
  const stores = await readStores(page)
  const bank = stores.banks.find((item) => item.title === 'E2E 文本题库')
  expect(bank?.questions).toHaveLength(2)
  expect(bank?.questions[0].type).toBe('single')
  expect(bank?.questions[1].type).toBe('multiple')
  expect(bank?.questions[1].answer).toEqual([1, 3])
})

test('模拟考试按题型赋分、判定及格线并保存模考记录', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)

  await page.getByRole('link', { name: /模拟考试/ }).click()
  await expect(page.getByText('模拟考试')).toBeVisible()

  // 单选 2 分：C 正确。
  await page.getByRole('button', { name: /^C 12$/ }).click()
  await page.getByRole('button', { name: /下一题/ }).click()

  // 多选 3 分：B、D 正确。
  await page.getByRole('button', { name: /^B 2$/ }).click()
  await page.getByRole('button', { name: /^D 4$/ }).click()
  await page.getByRole('button', { name: /完成练习/ }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()

  await expect(page.getByRole('heading', { name: '过线了' })).toBeVisible()
  await expect(page.locator('.result-score')).toContainText('5')
  await expect(page.locator('.result-score')).toContainText('/ 5')
  await expect(page.getByText('已及格 · 及格线 3')).toBeVisible()
  await expect(page.locator('.exam-type-row').filter({ hasText: '单选题' }).locator('.exam-type-score')).toHaveText('2 / 2')
  await expect(page.locator('.exam-type-row').filter({ hasText: '多选题' }).locator('.exam-type-score')).toHaveText('3 / 3')

  const stores = await readStores(page)
  const entry = stores.history[0]
  expect(entry.exam).toMatchObject({
    score: 5,
    fullScore: 5,
    passScore: 3,
    passed: true,
  })
  expect(entry.exam?.types).toEqual([
    expect.objectContaining({ type: 'single', correct: 1, total: 1, score: 2, fullScore: 2 }),
    expect.objectContaining({ type: 'multiple', correct: 1, total: 1, score: 3, fullScore: 3 }),
  ])

  // 刷新后 query 里的 record 仍能找回同一条模考记录，分数不会退回正确率。
  await page.reload()
  await expect(page.getByRole('heading', { name: '过线了' })).toBeVisible()
  await expect(page.locator('.result-score')).toContainText('5')
})

test('填空与简答从文本导入到作答、错题记录形成闭环', async ({ page }) => {
  const TEXT_TYPES = `# E2E 文本题型

1. 中国的首都是？【填空题】
答案：北京|北京市
解析：北京是中华人民共和国的首都。

2. 光合作用需要哪两个条件？【简答题】
参考答案：光照和叶绿体。
关键词：光照|叶绿体
解析：光照提供能量，叶绿体是反应场所。
`
  await importText(page, TEXT_TYPES, 'E2E 文本题型')
  const imported = await readStores(page)
  const bank = imported.banks.find((item) => item.title === 'E2E 文本题型')
  expect(bank?.questions[0].type).toBe('fill')
  expect(bank?.questions[0].options).toEqual([])
  expect(bank?.questions[0].answerText).toEqual(['北京', '北京市'])
  expect(bank?.questions[1].type).toBe('short')
  expect(bank?.questions[1].keywords).toEqual(['光照', '叶绿体'])

  await openBank(page, 'E2E 文本题型')
  await expect(page.getByText('填空、简答共 2 题')).toBeVisible()
  await page.getByRole('link', { name: /顺序练习/ }).click()
  await page.getByLabel('填写答案').fill('北京')
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.locator('.analysis-answer')).toContainText('北京')
  await page.getByRole('button', { name: /下一题/ }).click()
  await page.getByLabel('填写简答答案').fill('只要有光照就行')
  await page.getByRole('button', { name: /确认答案/ }).click()
  await expect(page.locator('.analysis-keywords')).toContainText('光照、叶绿体')
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()
  await expect(page.getByText(/最近一次记录已保存/)).toBeVisible()

  await page.goto('/review?tab=wrong')
  await page.locator('.wrong-head').first().click()
  await expect(page.locator('.wrong-text-answer')).toContainText('只要有光照就行')
  await expect(page.locator('.wrong-text-answer')).toContainText('光照和叶绿体')
})

test('题库编辑器保留文本题的答案与关键词', async ({ page }) => {
  const TEXT_TYPES = `# E2E 文本题型

1. 中国的首都是？【填空题】
答案：北京|北京市
解析：北京是中华人民共和国的首都。

2. 光合作用需要哪两个条件？【简答题】
参考答案：光照和叶绿体。
关键词：光照|叶绿体
解析：光照提供能量，叶绿体是反应场所。
`
  await importText(page, TEXT_TYPES, 'E2E 文本题型')
  const stores = await readStores(page)
  const bank = stores.banks.find((item) => item.title === 'E2E 文本题型')
  expect(bank?.id).toBeTruthy()
  await page.goto(`/edit/${bank!.id}`)
  await expect(page.getByRole('heading', { name: /修改「E2E 文本题型」/ })).toBeVisible()

  const first = page.locator('.edit-question').nth(0)
  await expect(first.getByRole('button', { name: '填空' })).toHaveClass(/active/)
  await expect(first.locator('.edit-text-answer input').first()).toHaveValue('北京|北京市')
  await first.locator('.edit-text-answer input').first().fill('北京|北京市|京城')

  const second = page.locator('.edit-question').nth(1)
  await expect(second.getByRole('button', { name: '简答' })).toHaveClass(/active/)
  await expect(second.locator('.edit-text-answer input').nth(1)).toHaveValue('光照|叶绿体')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('已保存，题库内容与编号均已更新')).toBeVisible()

  const saved = await readStores(page)
  const edited = saved.banks.find((item) => item.id === bank!.id)
  expect(edited?.questions[0].answerText).toEqual(['北京', '北京市', '京城'])
  expect(edited?.questions[1].keywords).toEqual(['光照', '叶绿体'])
})

test('Word 文档解出题号模板并落库', async ({ page }) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t># E2E Word 题库</w:t></w:r></w:p>
<w:p><w:r><w:t>1. 一年有多少个月？</w:t></w:r></w:p>
<w:p><w:r><w:t>A. 10</w:t></w:r></w:p>
<w:p><w:r><w:t>B. 11</w:t></w:r></w:p>
<w:p><w:r><w:t>C. 12</w:t></w:r></w:p>
<w:p><w:r><w:t>D. 13</w:t></w:r></w:p>
<w:p><w:r><w:t>答案：C</w:t></w:r></w:p>
<w:p><w:r><w:t>解析：一年十二个月，这是常识。</w:t></w:r></w:p>
<w:p><w:r><w:t>2. 下列哪些是偶数？【多选】</w:t></w:r></w:p>
<w:p><w:r><w:t>A. 1</w:t></w:r></w:p>
<w:p><w:r><w:t>B. 2</w:t></w:r></w:p>
<w:p><w:r><w:t>C. 3</w:t></w:r></w:p>
<w:p><w:r><w:t>D. 4</w:t></w:r></w:p>
<w:p><w:r><w:t>答案：B、D</w:t></w:r></w:p>
<w:p><w:r><w:t>解析：能被 2 整除的是偶数。</w:t></w:r></w:p>
</w:body></w:document>`
  const buffer = Buffer.from(zipSync({ 'word/document.xml': strToU8(xml) }))
  await page.goto('/import')
  await page.setInputFiles('input[type="file"]', {
    name: 'E2E Word 题库.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  })
  await expect(page.getByRole('heading', { name: 'E2E Word 题库' })).toBeVisible()
  await page.getByRole('button', { name: /确认导入 2 题/ }).click()
  await expect(page.getByRole('heading', { name: /已导入 2 题/ })).toBeVisible()
  const stores = await readStores(page)
  const bank = stores.banks.find((item) => item.title === 'E2E Word 题库')
  expect(bank?.questions).toHaveLength(2)
  expect(bank?.questions[1].answer).toEqual([1, 3])
})

test('背题模式显示答案但不写入正确率和历史', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /背题模式/ }).click()
  await expect(page.locator('.study-stem')).toContainText('一年有多少个月')
  await page.getByRole('button', { name: '显示答案' }).click()
  await expect(page.getByText(/正确答案：12/)).toBeVisible()
  await expect(page.getByText('一年十二个月')).toBeVisible()
  await expect(page.getByText(/已看 1 \/ 2 题/)).toBeVisible()

  const stores = await readStores(page)
  expect(stores.history).toHaveLength(0)
  expect(stores.wrong).toHaveLength(0)
})

test('错题可标错因和保存笔记，刷新后仍在', async ({ page }) => {
  await importCsv(page, CSV, 'E2E 题库')
  await openBank(page)
  await page.getByRole('link', { name: /顺序练习/ }).click()
  await page.getByRole('button', { name: /^A 10$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await page.getByRole('button', { name: /下一题/ }).click()
  await page.getByRole('button', { name: /^B 2$/ }).click()
  await page.getByRole('button', { name: /^D 4$/ }).click()
  await page.getByRole('button', { name: /确认答案/ }).click()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '提交并查看结果' }).click()
  await expect(page.getByText(/最近一次记录已保存/)).toBeVisible()

  await page.goto('/review?tab=wrong')
  await page.locator('.wrong-head').first().click()
  await page.getByRole('button', { name: /概念没懂/ }).click()
  const note = page.getByPlaceholder(/记一句/)
  await note.fill('把年份记成 11 个月了')
  await page.getByRole('button', { name: '保存笔记' }).click()

  await expect.poll(async () => {
    const stores = await readStores(page)
    return stores.wrong[0]?.reason
  }).toBe('concept')
  const saved = await readStores(page)
  expect(saved.wrong[0]?.note).toBe('把年份记成 11 个月了')

  await page.reload()
  await page.goto('/review?tab=wrong')
  await page.locator('.wrong-head').first().click()
  await expect(page.locator('.wrong-note textarea')).toHaveValue('把年份记成 11 个月了')
})
