import type { TutorSettings } from '../../data/records'

/**
 * 本地模型的默认入口。
 *
 * 只写 127.0.0.1，不写 localhost：部分系统把 localhost 解析到 IPv6，
 * 而 Ollama / llama.cpp 往往只监听 IPv4，用户会得到一个莫名其妙的网络错误。
 */
export const DEFAULT_TUTOR_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions'
export const DEFAULT_TUTOR_MODEL = 'qwen2.5:3b'

export const DEFAULT_TUTOR_SETTINGS: TutorSettings = {
  enabled: false,
  endpoint: DEFAULT_TUTOR_ENDPOINT,
  model: DEFAULT_TUTOR_MODEL,
}

/** 旧备份没有 tutor 字段；这里统一补齐，不改动其他设置。 */
export function normalizeTutorSettings(
  settings: Partial<TutorSettings> | null | undefined,
): TutorSettings {
  return {
    ...DEFAULT_TUTOR_SETTINGS,
    ...(settings ?? {}),
    endpoint: (settings?.endpoint ?? '').trim() || DEFAULT_TUTOR_ENDPOINT,
    model: (settings?.model ?? '').trim() || DEFAULT_TUTOR_MODEL,
  }
}
