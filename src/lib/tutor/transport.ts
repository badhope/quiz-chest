import { CapacitorHttp } from '@capacitor/core'
import { isNativeMobile } from '../platform'
import { extractCompletionText, normalizeTutorText, planTutorRequest } from './protocol'
import { normalizeTutorSettings } from './config'
import type { AskTutorInput, TutorCompletionRequest, TutorOutcome } from './types'

interface CompletionTransportResult {
  status: number
  data: unknown
}

export type TutorTransport = (
  request: TutorCompletionRequest,
) => Promise<CompletionTransportResult>

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError')
  )
}

async function webTransport(
  request: TutorCompletionRequest,
): Promise<CompletionTransportResult> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  request.signal?.addEventListener('abort', onAbort)
  const timer = globalThis.setTimeout(() => controller.abort(), request.timeoutMs)

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: 0.2,
        max_tokens: request.maxTokens,
        stream: false,
      }),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
    const raw = await response.text()
    let data: unknown = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // 非 JSON 的 4xx/5xx 也保留原文，调用方只展示状态码，不展示题干。
    }
    return { status: response.status, data }
  } finally {
    globalThis.clearTimeout(timer)
    request.signal?.removeEventListener('abort', onAbort)
  }
}

async function nativeTransport(
  request: TutorCompletionRequest,
): Promise<CompletionTransportResult> {
  const response = await CapacitorHttp.post({
    url: request.url,
    headers: { 'Content-Type': 'application/json' },
    data: {
      model: request.model,
      messages: request.messages,
      temperature: 0.2,
      max_tokens: request.maxTokens,
      stream: false,
    },
    connectTimeout: Math.min(5000, request.timeoutMs),
    readTimeout: request.timeoutMs,
    responseType: 'json',
  })
  return { status: response.status, data: response.data }
}

function buildTransport(): TutorTransport {
  return isNativeMobile() ? nativeTransport : webTransport
}

function failureFromException(error: unknown, timeoutMs = 45_000): TutorOutcome {
  if (isAbort(error)) {
    return {
      ok: false,
      code: 'timeout',
      error: `本机模型在 ${Math.round(timeoutMs / 1000)} 秒内没有返回。先看题库解析，确认模型服务已启动后再试。`,
    }
  }
  const detail = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    code: 'network',
    error: `连不上本机模型：${detail}。请确认 Ollama / llama.cpp 已启动，并检查端点与端口。`,
  }
}

/**
 * 调用本机 OpenAI 兼容端点。失败不抛给答题页，返回可展示的原因，
 * 题库自带解析始终是兜底，不会因为模型不可用而做不了题。
 */
export async function askTutor(
  input: AskTutorInput,
  transport: TutorTransport = buildTransport(),
): Promise<TutorOutcome> {
  const plan = planTutorRequest(input)
  if (!('request' in plan)) return plan

  let result: CompletionTransportResult
  try {
    result = await transport(plan.request)
  } catch (error) {
    return failureFromException(error, plan.request.timeoutMs)
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      code: 'http',
      error: `本机模型返回 HTTP ${result.status}。请检查模型名与端点路径。`,
    }
  }

  const text = normalizeTutorText(extractCompletionText(result.data))
  if (!text) {
    return {
      ok: false,
      code: 'empty',
      error: '模型返回了空内容。可以换一个模型，或先看题库解析。',
    }
  }
  return { ok: true, text }
}

/** 设置页的「测试连接」只发一句固定探测文本，不发送任何题目。 */
export async function testTutorConnection(
  settings: AskTutorInput['settings'],
  transport: TutorTransport = buildTransport(),
): Promise<TutorOutcome> {
  const plan = planTutorRequest({
    settings: { ...normalizeTutorSettings(settings), enabled: true },
    // 探测不走题目上下文；这个临时题只用于复用端点与开关校验。
    question: {
      id: 'tutor-connection-check',
      collectionId: 'system',
      type: 'single',
      stem: '连接测试',
      options: ['OK'],
      answer: [0],
      explanation: '只发送这一句固定探测文本。',
      difficulty: 1,
      tags: [],
    },
    selection: [],
    mode: 'explain',
  })
  if (!('request' in plan)) return plan

  const probe: TutorCompletionRequest = {
    ...plan.request,
    messages: [
      { role: 'system', content: '只回复 OK，不要解释。' },
      { role: 'user', content: '连接测试' },
    ],
    maxTokens: 8,
    timeoutMs: 20_000,
  }

  let result: CompletionTransportResult
  try {
    result = await transport(probe)
  } catch (error) {
    return failureFromException(error, probe.timeoutMs)
  }
  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      code: 'http',
      error: `本机模型返回 HTTP ${result.status}。请检查模型名与端点路径。`,
    }
  }
  const text = normalizeTutorText(extractCompletionText(result.data))
  return text
    ? { ok: true, text }
    : { ok: false, code: 'empty', error: '模型返回了空内容，连接测试未通过。' }
}
