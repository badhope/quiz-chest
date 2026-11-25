import { describe, expect, it, vi } from 'vitest'
import type { Question } from '../../data/types'
import {
  buildTutorMessages,
  extractCompletionText,
  normalizeTutorText,
  planTutorRequest,
  validateTutorEndpoint,
} from './protocol'
import { askTutor, testTutorConnection, type TutorTransport } from './transport'
import type { TutorCompletionRequest } from './types'
import { DEFAULT_TUTOR_SETTINGS, normalizeTutorSettings } from './config'

const question: Question = {
  id: 'q-1',
  collectionId: 'c-1',
  type: 'single',
  stem: '若函数 f(x)=x² 在 x=1 处可导，则 f\'(1) 等于多少？',
  options: ['0', '1', '2', '3'],
  answer: [2],
  explanation: '幂函数求导后为 2x，代入 x=1 得 2。',
  difficulty: 2,
  tags: ['导数'],
}

function settings(overrides: Partial<typeof DEFAULT_TUTOR_SETTINGS> = {}) {
  return { ...DEFAULT_TUTOR_SETTINGS, enabled: true, ...overrides }
}

describe('normalizeTutorSettings', () => {
  it('旧备份缺字段或空值时补默认，不把空端点交给请求层', () => {
    expect(normalizeTutorSettings(undefined)).toEqual(DEFAULT_TUTOR_SETTINGS)
    const normalized = normalizeTutorSettings({ enabled: true, endpoint: ' ', model: '' })
    expect(normalized.enabled).toBe(true)
    expect(normalized.endpoint).toBe(DEFAULT_TUTOR_SETTINGS.endpoint)
    expect(normalized.model).toBe(DEFAULT_TUTOR_SETTINGS.model)
  })
})

describe('validateTutorEndpoint', () => {
  it('允许本机 IPv4、localhost 与 IPv6 回环', () => {
    for (const endpoint of [
      'http://127.0.0.1:11434/v1/chat/completions',
      'http://localhost:8080/v1/chat/completions',
      'https://localhost:8443/v1/chat/completions',
      'http://[::1]:11434/v1/chat/completions',
    ]) {
      expect(validateTutorEndpoint(endpoint).ok).toBe(true)
    }
  })

  it('拒绝局域网、公网、账号信息和非 http 协议', () => {
    for (const endpoint of [
      'http://192.168.1.20:11434/v1/chat/completions',
      'https://api.example.com/v1/chat/completions',
      'http://user:pass@127.0.0.1:11434/v1/chat/completions',
      'ftp://127.0.0.1:11434/v1/chat/completions',
      'not-a-url',
    ]) {
      expect(validateTutorEndpoint(endpoint).ok).toBe(false)
    }
  })
})

describe('buildTutorMessages', () => {
  it('讲解模式带答案与解析，但只发当前题', () => {
    const messages = buildTutorMessages(question, [0], 'explain')
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toContain('不要修改正确答案')
    const context = messages[1].content
    expect(context).toContain('若函数')
    expect(context).toContain('【正确答案】C')
    expect(context).toContain('【题库解析】幂函数求导')
    expect(context).toContain('【学生选择】A')
    expect(context).not.toContain('c-1')
    expect(context).not.toContain('导数') // tags 不发送
  })

  it('提示模式不发答案与题库解析', () => {
    const messages = buildTutorMessages(question, [0], 'hint')
    const context = messages[1].content
    expect(context).not.toContain('【正确答案】')
    expect(context).not.toContain('【题库解析】')
    expect(messages[0].content).toContain('不能直接揭示正确选项')
  })

  it('追问只带上最近六条对话，且不重复当前题的上下文', () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `history-${index}`,
    }))
    const messages = buildTutorMessages(question, [0], 'followup', '为什么不是 A？', history)
    expect(messages).toHaveLength(2 + 6 + 1)
    expect(messages[2].content).toBe('history-2')
    expect(messages[7].content).toBe('history-7')
    expect(messages[8]).toEqual({ role: 'user', content: '为什么不是 A？' })
    expect(messages[1].content).not.toContain('【我的问题】')
  })

  it('配图题明确说明图片没有发送', () => {
    const messages = buildTutorMessages({ ...question, image: 'data:image/png;base64,xx' }, [0], 'explain')
    expect(messages[1].content).toContain('图片内容没有发送')
  })
})

describe('extractCompletionText', () => {
  it('兼容 OpenAI choices/message 与纯文本', () => {
    expect(
      extractCompletionText({ choices: [{ message: { content: '先看求导公式。' } }] }),
    ).toBe('先看求导公式。')
    expect(extractCompletionText({ choices: [{ text: '旧格式' }] })).toBe('旧格式')
    expect(
      extractCompletionText({
        choices: [{ message: { content: [{ type: 'text', text: '分片' }, { text: '内容' }] } }],
      }),
    ).toBe('分片内容')
    expect(extractCompletionText('{"choices":[{"message":{"content":"字符串 JSON"}}]}')).toBe(
      '字符串 JSON',
    )
  })

  it('空响应返回空字符串', () => {
    expect(extractCompletionText({})).toBe('')
    expect(extractCompletionText(null)).toBe('')
    expect(extractCompletionText({ choices: [] })).toBe('')
  })
})

describe('normalizeTutorText', () => {
  it('清掉控制字符但保留换行，并限制最大长度', () => {
    expect(normalizeTutorText('第一行\u0000\n第二行\u001f')).toBe('第一行\n第二行')
    expect(normalizeTutorText('x'.repeat(8000))).toHaveLength(6000)
  })
})

describe('planTutorRequest', () => {
  it('关闭时返回明确原因，不发请求', () => {
    const plan = planTutorRequest({
      settings: settings({ enabled: false }),
      question,
      selection: [],
      mode: 'explain',
    })
    expect('request' in plan).toBe(false)
    if (!('request' in plan)) expect(plan.code).toBe('disabled')
  })

  it('公网端点被拦截', () => {
    const plan = planTutorRequest({
      settings: settings({ endpoint: 'http://10.0.0.8:11434/v1/chat/completions' }),
      question,
      selection: [],
      mode: 'explain',
    })
    expect('request' in plan).toBe(false)
    if (!('request' in plan)) expect(plan.code).toBe('invalid-endpoint')
  })

  it('正常设置生成 loopback 请求与模型名', () => {
    const plan = planTutorRequest({
      settings: settings({ model: 'qwen2.5:3b' }),
      question,
      selection: [0],
      mode: 'explain',
    })
    expect('request' in plan).toBe(true)
    if ('request' in plan) {
      expect(plan.request.url).toBe('http://127.0.0.1:11434/v1/chat/completions')
      expect(plan.request.model).toBe('qwen2.5:3b')
      expect(plan.request.maxTokens).toBe(640)
      expect(plan.request.messages).toHaveLength(2)
    }
  })
})

describe('askTutor', () => {
  const input = {
    settings: settings(),
    question,
    selection: [0],
    mode: 'explain' as const,
  }

  it('解析成功响应', async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      data: { choices: [{ message: { content: '因为 f\'(x)=2x。' } }] },
    }))
    const outcome = await askTutor(input, transport)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.text).toContain('2x')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('HTTP 错误不抛异常，返回可展示原因', async () => {
    const outcome = await askTutor(input, async () => ({ status: 404, data: 'not found' }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('http')
      expect(outcome.error).toContain('404')
    }
  })

  it('空响应走降级提示', async () => {
    const outcome = await askTutor(input, async () => ({
      status: 200,
      data: { choices: [{ message: { content: '   ' } }] },
    }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('empty')
  })
})

describe('testTutorConnection', () => {
  it('关闭状态下也能测试连接，且只发固定探测文本', async () => {
    const calls: TutorCompletionRequest[] = []
    const transport: TutorTransport = vi.fn(async (request) => {
      calls.push(request)
      return {
        status: 200,
        data: { choices: [{ message: { content: 'OK' } }] },
      }
    })
    const outcome = await testTutorConnection(settings({ enabled: false }), transport)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.text).toBe('OK')
    const request = calls[0]
    expect(request.messages).toEqual([
      { role: 'system', content: '只回复 OK，不要解释。' },
      { role: 'user', content: '连接测试' },
    ])
    expect(request.maxTokens).toBe(8)
  })
})
