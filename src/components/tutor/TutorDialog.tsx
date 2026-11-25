import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import type { Question } from '../../data/types'
import { answerLabel, type SessionMode, typeLabel } from '../../lib/quiz'
import {
  askTutor,
  normalizeTutorSettings,
  type TutorChatMessage,
  type TutorMode,
} from '../../lib/tutor'
import { useAppStore } from '../../store/useAppStore'
import { CircleAlert, Send, Sparkles, X } from '../ui/icons'

interface TutorDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  question: Question
  selection: number[]
  textAnswer?: string
  mode: SessionMode
  isChecked: boolean
}

/**
 * 单题讲解弹层。
 *
 * 设计约束放在组件里而不是文档里：
 * - 只在用户点「问小星」时发请求；
 * - 每次只发当前题的题干/选项/答案/解析；
 * - 对话只存在内存，关闭即丢；
 * - 模型挂了就退回题库解析，不影响继续刷题。
 */
export function TutorDialog({
  open,
  onOpenChange,
  question,
  selection,
  textAnswer = '',
  mode,
  isChecked,
}: TutorDialogProps) {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const tutor = normalizeTutorSettings(settings.tutor)
  const [messages, setMessages] = useState<TutorChatMessage[]>([])
  const [busy, setBusy] = useState(tutor.enabled)
  const [error, setError] = useState('')
  const [followup, setFollowup] = useState('')
  const [notice, setNotice] = useState('')
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!tutor.enabled) return
    let alive = true
    const controller = new AbortController()
    controllerRef.current = controller
    askTutor({
      settings: tutor,
      question,
      selection,
      textAnswer,
      mode: 'explain',
      history: [],
      signal: controller.signal,
    }).then((outcome) => {
      if (!alive) return
      setBusy(false)
      if (outcome.ok) {
        setMessages([{ role: 'assistant', content: outcome.text }])
      } else {
        setError(outcome.error)
      }
    })
    return () => {
      alive = false
      controller.abort()
    }
    // 弹层只在打开时挂载，题面与设置在本轮生命周期内不变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async (
    nextMode: TutorMode,
    text: string,
    history: TutorChatMessage[],
    userVisible?: string,
  ) => {
    if (busy) return
    const id = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    if (userVisible) {
      setMessages((previous) => [...previous, { role: 'user', content: userVisible }])
    }

    const outcome = await askTutor({
      settings: tutor,
      question,
      selection,
      textAnswer,
      mode: nextMode,
      followup: text,
      history,
      signal: controller.signal,
    })
    if (id !== requestId.current) return
    setBusy(false)
    if (outcome.ok) {
      setMessages((previous) => [...previous, { role: 'assistant', content: outcome.text }])
    } else {
      setError(outcome.error)
    }
  }

  const sendFollowup = () => {
    const text = followup.trim()
    if (!text || busy) return
    const history = messages
    setFollowup('')
    void send('followup', text, history, text)
  }

  const askHint = () => {
    if (busy) return
    void send('hint', '', [], '先给我一个提示，不要直接说答案。')
    setNotice('提示模式不发送答案和解析，避免模型直接报答案。')
  }

  const askAgain = () => {
    if (busy) return
    void send('followup', '请换一种更简单的说法再讲一遍，不要重复原话。', messages)
  }

  const goSettings = () => {
    onOpenChange(false)
    navigate('/settings')
  }

  const messageCount = messages.length

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="tutor-overlay" />
        <Dialog.Content
          className="tutor-panel"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.querySelector<HTMLElement>('.tutor-ask')?.focus()
          }}
        >
          <header className="tutor-head">
            <div className="tutor-brand">
              <span className="tutor-mark">
                <Sparkles />
              </span>
              <div>
                <Dialog.Title className="tutor-title">问小星</Dialog.Title>
                <Dialog.Description className="tutor-subtitle">
                  {tutor.enabled ? '本机模型 · 只发当前题' : '本地 AI 讲解未开启'}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭问小星">
                <X />
              </button>
            </Dialog.Close>
          </header>

          <div className="tutor-context">
            <span className="tutor-context-label">当前题</span>
            <p>{question.stem}</p>
            <div className="tutor-context-meta">
              <span>{typeLabel(question.type)}</span>
              <span>{question.type === 'fill' ? '正确答案' : question.type === 'short' ? '参考答案' : '正确答案'} {answerLabel(question)}</span>
              {isChecked ? <span>{mode === 'exam' ? '考试中' : '已判分'}</span> : null}
            </div>
          </div>

          <div className="tutor-thread" aria-live="polite">
            <section className="tutor-fallback">
              <header>
                <span>题库解析</span>
                <span className="tutor-fallback-note">不依赖模型</span>
              </header>
              <p>{question.explanation}</p>
            </section>

            {!tutor.enabled ? (
              <section className="tutor-setup">
                <div className="tutor-setup-icon">
                  <Sparkles />
                </div>
                <div>
                  <h3>把讲解交给你自己的模型</h3>
                  <p>
                    题小星不内置云端模型。开启后只向本机
                    127.0.0.1 的 Ollama / llama.cpp 发当前题，不传题库、历史或备份。
                  </p>
                  <button className="button button-primary" onClick={goSettings}>
                    去设置里开启
                  </button>
                </div>
              </section>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`tutor-bubble tutor-bubble-${message.role}`}
              >
                <span className="tutor-bubble-role">
                  {message.role === 'user' ? '你' : '小星'}
                </span>
                <p>{message.content}</p>
              </div>
            ))}

            {busy ? (
              <div className="tutor-thinking">
                <span className="tutor-thinking-dot" />
                正在本机推理…
              </div>
            ) : null}

            {error ? (
              <div className="tutor-error" role="alert">
                <CircleAlert />
                <div>
                  <p>{error}</p>
                  {tutor.enabled ? (
                    <button className="tutor-inline-button" onClick={() => void send('explain', '', [])}>
                      再试一次
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {notice && !error ? <p className="tutor-notice">{notice}</p> : null}
          </div>

          {tutor.enabled ? (
            <>
              <div className="tutor-quick">
                <button className="tutor-quick-button" onClick={askHint} disabled={busy}>
                  <Sparkles /> 只给提示
                </button>
                {messageCount > 0 ? (
                  <button className="tutor-quick-button" onClick={askAgain} disabled={busy}>
                    换一种说法
                  </button>
                ) : null}
              </div>
              <div className="tutor-compose">
                <textarea
                  ref={inputRef}
                  value={followup}
                  onChange={(event) => setFollowup(event.target.value)}
                  placeholder="追问这一步为什么…（Enter 发送，Shift+Enter 换行）"
                  aria-label="向小星追问"
                  rows={2}
                  maxLength={1200}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      sendFollowup()
                    }
                  }}
                />
                <button
                  className="button button-primary tutor-send"
                  onClick={sendFollowup}
                  disabled={busy || !followup.trim()}
                  aria-label="发送追问"
                >
                  <Send />
                </button>
              </div>
              <p className="tutor-privacy">
                对话只在本次打开期间存在，关闭即清除；不发题库、不发历史记录、不记录题干。
              </p>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
