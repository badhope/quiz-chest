import type { TutorSettings } from '../../data/records'
import type { Question } from '../../data/types'
import { LETTERS } from '../quiz'
import { normalizeTutorSettings } from './config'
import type {
  AskTutorInput,
  TutorApiMessage,
  TutorChatMessage,
  TutorCompletionRequest,
  TutorMode,
  TutorOutcome,
} from './types'

const MAX_STEM = 2200
const MAX_OPTION = 500
const MAX_EXPLANATION = 1600
const MAX_FOLLOWUP = 1200
const MAX_RESPONSE = 6000

const SYSTEM_PROMPT = [
  '你是题小星的本地讲解助手。',
  '只根据用户给出的当前题目、选项、答案与题库解析作解释，不要修改正确答案，不要重新判分，不要编造教材、页码或作者。',
  '回答使用简体中文，先给结论，再分 2 到 4 步说明；不确定时直接说不确定。',
  '不要输出 HTML、脚本或超过 600 字的空泛套话。',
].join('\n')

const HINT_PROMPT = [
  '你是题小星的本地提示助手。',
  '只给出一个循序渐进的提示，不能直接揭示正确选项，也不能复述题库解析里的答案。',
  '最多三句话；如果必须提到方向，用“先看题干中的哪一层关系”这种方式提示。',
].join('\n')

function clip(text: string, max: number): string {
  const value = text.trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function answerLetters(answer: number[]): string {
  return answer
    .filter((value) => Number.isInteger(value) && value >= 0)
    .map((value) => LETTERS[value] ?? `#${value + 1}`)
    .join('、')
}

export interface EndpointCheck {
  ok: boolean
  url?: URL
  error?: string
}

/**
 * 只允许本机回环地址。
 *
 * 这不是 UI 提示，而是硬边界：用户在设置里填了公网地址时，题目不能发出去。
 * `localhost` 允许，但默认仍建议 127.0.0.1，避免 IPv4/IPv6 解析差异。
 */
export function validateTutorEndpoint(endpoint: string): EndpointCheck {
  const raw = endpoint.trim()
  if (!raw) return { ok: false, error: '端点不能为空。' }
  if (raw.length > 300) return { ok: false, error: '端点过长。' }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: '端点不是合法 URL，例如 http://127.0.0.1:11434/v1/chat/completions。' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: '只支持 http/https 的本机端点。' }
  }
  if (url.username || url.password) {
    return { ok: false, error: '端点里不要放账号或口令。' }
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    return { ok: false, error: '为了不把题目发出本机，端点只允许 127.0.0.1、localhost 或 ::1。' }
  }
  return { ok: true, url }
}

/** 题目上下文只取当前题；不传题库、历史记录、备份或图片 URL。 */
export function buildTutorMessages(
  question: Question,
  selection: number[],
  mode: TutorMode,
  followup = '',
  history: TutorChatMessage[] = [],
): TutorApiMessage[] {
  const includeAnswer = mode !== 'hint'
  const options = question.options
    .map((option, index) => `${LETTERS[index] ?? index + 1}. ${clip(option, MAX_OPTION)}`)
    .join('\n')
  const imageNote =
    question.image || question.optionImages?.some(Boolean)
      ? '本题含配图；图片内容没有发送，只能依据文字题干和选项讲解。'
      : ''

  const lines = [
    `【题型】${question.type === 'multiple' ? '多选题' : question.type === 'judge' ? '判断题' : '单选题'}`,
    `【题干】${clip(question.stem, MAX_STEM)}`,
    `【选项】\n${options}`,
    `【学生选择】${selection.length ? answerLetters(selection) : '未作答'}`,
  ]
  if (includeAnswer) {
    lines.push(`【正确答案】${answerLetters(question.answer)}`)
    lines.push(`【题库解析】${clip(question.explanation, MAX_EXPLANATION)}`)
  }
  if (imageNote) lines.push(`【配图说明】${imageNote}`)

  const ask =
    mode === 'hint'
      ? '请给我一个不直接揭示答案的提示。'
      : '请解释为什么正确答案是这个选项；如果我选错了，指出我可能卡在哪一步。'

  const context: TutorApiMessage = { role: 'user', content: lines.join('\n') }
  const cleanHistory: TutorApiMessage[] = history
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: clip(message.content, MAX_FOLLOWUP),
    }))
    .filter((message) => message.content.length > 0)

  if (mode === 'followup') {
    // 上下文先作为第一轮 user，再放历史 assistant/user 对，最后才是新追问。
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      context,
      ...cleanHistory,
      {
        role: 'user',
        content: clip(followup || '请再解释一遍。', MAX_FOLLOWUP),
      },
    ]
  }

  return [
    { role: 'system', content: mode === 'hint' ? HINT_PROMPT : SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${lines.join('\n')}\n【我的问题】${ask}`,
    },
  ]
}

export function extractCompletionText(data: unknown): string {
  if (typeof data === 'string') {
    const raw = data.trim()
    if (!raw) return ''
    try {
      return extractCompletionText(JSON.parse(raw))
    } catch {
      return raw
    }
  }
  if (!data || typeof data !== 'object') return ''

  const record = data as Record<string, unknown>
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0] as Record<string, unknown> | undefined
  if (!first) {
    // 一些本地服务直接返回 { message: { content } }，不套 choices。
    const message = record.message as Record<string, unknown> | undefined
    return typeof message?.content === 'string' ? message.content.trim() : ''
  }

  if (typeof first.text === 'string') return first.text.trim()
  const message = first.message as Record<string, unknown> | undefined
  if (typeof message?.content === 'string') return message.content.trim()
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as Record<string, unknown>).text as string
        }
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

/** 模型输出按纯文本渲染；这里只清控制字符并限长，不执行任何 HTML。 */
export function normalizeTutorText(text: string): string {
  // 不用控制字符正则：保留换行/制表，其余 C0 与 DEL 直接丢掉。
  const clean = Array.from(text)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 || code === 9 || code === 10 || code === 13
    })
    .join('')
  return clean.trim().slice(0, MAX_RESPONSE)
}

export interface TutorRequestPlan {
  request: TutorCompletionRequest
  mode: TutorMode
}

type TutorFailure = Extract<TutorOutcome, { ok: false }>

/**
 * 把设置、题目和追问组装成一次请求。纯函数，测试不需要起 HTTP 服务。
 */
export function planTutorRequest(input: AskTutorInput): TutorFailure | TutorRequestPlan {
  const settings = normalizeTutorSettings(input.settings)
  if (!settings.enabled) {
    return {
      ok: false,
      code: 'disabled',
      error: '本地 AI 讲解未开启。',
    }
  }

  const endpoint = validateTutorEndpoint(settings.endpoint)
  if (!endpoint.ok || !endpoint.url) {
    return {
      ok: false,
      code: 'invalid-endpoint',
      error: endpoint.error ?? '端点不合法。',
    }
  }

  const messages = buildTutorMessages(
    input.question,
    input.selection,
    input.mode,
    input.followup,
    input.history,
  )

  return {
    request: {
      url: endpoint.url.toString(),
      model: settings.model,
      messages,
      maxTokens: input.mode === 'hint' ? 160 : 640,
      timeoutMs: 45_000,
      signal: input.signal,
    },
    mode: input.mode,
  }
}

export function normalizeTutorSettingsForUi(settings: TutorSettings | undefined): TutorSettings {
  return normalizeTutorSettings(settings)
}
