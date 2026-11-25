import { test, expect, devices } from '@playwright/test'

/**
 * 本地 AI 讲解的端到端验证。
 *
 * 这里不启动真实模型：用 route 模拟 OpenAI 兼容响应，验证请求只带当前题、
 * 追问不乱序、模型失败时题库解析仍在，以及 320px 下弹层不越界。
 * 真机连 Ollama 仍属于发布前的手工验收项，不能由浏览器测试替代。
 */
test.use({
  ...devices['Pixel 5'],
  viewport: { width: 320, height: 568 },
  screen: { width: 320, height: 568 },
})

async function enableTutor(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  await page.locator('.tutor-settings').scrollIntoViewIfNeeded()
  await page.locator('.tutor-settings .settings-row button[role=switch]').click()
  await page.getByText('已保存，只在本机生效。').waitFor()
}

async function answerFirstQuestion(page: import('@playwright/test').Page) {
  await page.goto('/practice/calculus?mode=practice')
  await page.locator('.option').first().click()
  await page.getByRole('button', { name: /确认答案/ }).click()
}

test('关闭时显示设置入口与题库解析，不发起网络请求', async ({ page }) => {
  let called = 0
  await page.route('**/v1/chat/completions', async (route) => {
    called += 1
    await route.fulfill({ status: 200, body: '{}' })
  })

  await answerFirstQuestion(page)
  await page.locator('.tutor-ask').click()
  await expect(page.locator('.tutor-setup')).toBeVisible()
  await expect(page.locator('.tutor-fallback')).toBeVisible()
  await expect(page.locator('.tutor-fallback')).toContainText('第一重要极限')
  expect(called).toBe(0)
})

test('开启后只发送当前题，追问按 user/assistant 顺序追加', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = []
  await page.route('**/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    requests.push(request)
    // StrictMode 在开发环境会把首轮 effect 跑两遍；按消息结构判断是首轮还是追问，
    // 不按请求次数判断，避免把一次开发期重复调用误当成追问。
    const messages = request.messages as Array<{ role: string; content: string }> | undefined
    const isFollowup = messages?.length === 4 && messages.at(-1)?.role === 'user'
    const body = isFollowup
      ? 'A 错在把趋近于 0 当成等于 0；直接代入会得到 0/0。'
      : '正确答案是 B。sin x / x 在 x→0 时趋近于 1，这是第一重要极限。'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ choices: [{ message: { content: body } }] }),
    })
  })

  await enableTutor(page)
  await answerFirstQuestion(page)
  await page.locator('.tutor-ask').click()
  await expect(page.locator('.tutor-bubble-assistant')).toContainText('第一重要极限')

  const first = requests.find((request) => {
    const messages = request.messages as Array<unknown> | undefined
    return messages?.length === 2
  }) as { messages?: Array<{ role: string; content: string }> }
  expect(first.messages).toHaveLength(2)
  expect(first.messages?.[0].role).toBe('system')
  expect(first.messages?.[1].content).toContain('sin x / x')
  expect(first.messages?.[1].content).toContain('【正确答案】B')
  expect(JSON.stringify(first)).not.toContain('collectionId')

  const entry = await page.locator('.tutor-ask').boundingBox()
  expect(entry?.height ?? 0).toBeGreaterThanOrEqual(44)

  const panel = await page.locator('.tutor-panel').boundingBox()
  expect(panel?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(320)
  expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(568)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)

  await page.locator('.tutor-compose textarea').fill('为什么不是 A？')
  await page.locator('.tutor-send').click()
  await expect(page.locator('.tutor-bubble-assistant')).toHaveCount(2)

  const second = requests.find((request) => {
    const messages = request.messages as Array<unknown> | undefined
    return messages?.length === 4
  }) as { messages?: Array<{ role: string; content: string }> }
  expect(second.messages).toHaveLength(4)
  expect(second.messages?.map((message) => message.role)).toEqual([
    'system',
    'user',
    'assistant',
    'user',
  ])
  expect(second.messages?.[3].content).toBe('为什么不是 A？')
})

test('模型返回 500 时降级到题库解析，并给出重试入口', async ({ page }) => {
  await page.route('**/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '{"error":"boom"}',
    })
  })

  await enableTutor(page)
  await answerFirstQuestion(page)
  await page.locator('.tutor-ask').click()
  await expect(page.locator('.tutor-error')).toContainText('HTTP 500')
  await expect(page.locator('.tutor-fallback')).toContainText('第一重要极限')
  await expect(page.getByRole('button', { name: '再试一次' })).toBeVisible()
})
