import type { TutorSettings } from '../../data/records'
import type { Question } from '../../data/types'

export type TutorMode = 'explain' | 'hint' | 'followup'

export interface TutorApiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 弹层里保留的对话只用于本次追问，不落库、不参与统计。 */
export interface TutorChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type TutorErrorCode =
  | 'disabled'
  | 'invalid-endpoint'
  | 'timeout'
  | 'http'
  | 'empty'
  | 'network'
  | 'unknown'

export type TutorOutcome =
  | { ok: true; text: string }
  | { ok: false; code: TutorErrorCode; error: string }

export interface AskTutorInput {
  settings: TutorSettings | undefined
  question: Question
  selection: number[]
  /** 填空/简答的文本作答；选择题为空。 */
  textAnswer?: string
  mode: TutorMode
  followup?: string
  history?: TutorChatMessage[]
  signal?: AbortSignal
}

export interface TutorCompletionRequest {
  url: string
  model: string
  messages: TutorApiMessage[]
  maxTokens: number
  timeoutMs: number
  signal?: AbortSignal
}
