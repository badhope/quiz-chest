import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Question } from '../data/types'
import { useAppStore } from '../store/useAppStore'
import { dateKey, isCorrect, type SessionMode } from '../lib/quiz'
import { useCountdown, useTimer } from './useTimer'

const EMPTY_SELECTION: number[] = []

export interface PracticeSessionOptions {
  /** 本次会话的题目集合。首次渲染后冻结，避免外部重渲染改变题序。 */
  questions: Question[]
  mode: SessionMode
  /** 写入练习记录的 collectionId（策略练习为 `plan:<kind>`）。 */
  historyCollectionId: string
  historyTitle: string
  historyDomainId?: string
  /** 退出与结果页的返回地址。 */
  backTo: string
  timeLimitSec?: number
}

export interface PracticeSessionState {
  questions: Question[]
  current: Question | undefined
  index: number
  total: number
  answers: Record<string, number[]>
  checked: Record<string, boolean>
  selection: number[]
  isChecked: boolean
  showAnalysis: boolean
  answeredCount: number
  reviewedCount: number
  correctCount: number
  progress: number
  elapsed: string
  remainingLabel: string
  remainingSec: number
  timeCritical: boolean
  isLast: boolean
  select: (optionIndex: number) => void
  submitQuestion: () => void
  goNext: () => void
  goPrev: () => void
  goTo: (target: number) => void
  jumpToUnanswered: () => void
  finish: () => void
}

/**
 * 练习会话的全部状态与副作用。
 *
 * 与渲染完全解耦：组件只负责画，会话规则（判分、计时、错题收录、
 * 记录落库、跳转结果页）集中在这里，便于单测与复用。
 */
export function usePracticeSession(options: PracticeSessionOptions): PracticeSessionState {
  const {
    questions,
    mode,
    historyCollectionId,
    historyTitle,
    historyDomainId,
    backTo,
    timeLimitSec,
  } = options

  const navigate = useNavigate()
  const wrongBook = useAppStore((state) => state.wrongBook)
  const recordWrong = useAppStore((state) => state.recordWrong)
  const removeWrong = useAppStore((state) => state.removeWrong)
  const addHistory = useAppStore((state) => state.addHistory)
  const setLastCollection = useAppStore((state) => state.setLastCollection)
  const savePendingSession = useAppStore((state) => state.savePendingSession)
  const clearPendingSession = useAppStore((state) => state.clearPendingSession)
  const pendingSession = useAppStore((state) => state.pendingSession)
  const autoNext = useAppStore((state) => state.settings.autoNext)

  // 题目列表在首次渲染时冻结：练习过程中题库变化不应改变本次题序。
  const [sessionQuestions] = useState<Question[]>(() =>
    mode === 'review' ? questions.filter((question) => wrongBook[question.id]) : questions,
  )

  /**
   * 续做：只在「同一份题、同一模式、同一题库」时恢复。
   * 题目 ID 逐位比对，防止题库被编辑后题序变化导致答案错位。
   */
  const resumable = useMemo(() => {
    if (!pendingSession) return null
    if (pendingSession.mode !== mode) return null
    if (pendingSession.collectionId !== historyCollectionId) return null
    const currentIds = sessionQuestions.map((question) => question.id)
    if (currentIds.length !== pendingSession.questionIds.length) return null
    if (currentIds.some((id, i) => id !== pendingSession.questionIds[i])) return null
    return pendingSession
  }, [pendingSession, mode, historyCollectionId, sessionQuestions])

  const [answers, setAnswers] = useState<Record<string, number[]>>(() => resumable?.answers ?? {})
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const restored: Record<string, boolean> = {}
    for (const id of resumable?.checkedIds ?? []) restored[id] = true
    return restored
  })
  const [index, setIndex] = useState(() => {
    const target = resumable?.index ?? 0
    return Math.min(Math.max(0, target), Math.max(0, sessionQuestions.length - 1))
  })
  const [showAnalysis, setShowAnalysis] = useState(() => {
    // 恢复时如果当前题已核对过，直接把解析展开，避免用户以为刚选的答案没生效。
    const currentId = sessionQuestions[resumable?.index ?? 0]?.id
    return currentId ? Boolean(resumable?.checkedIds?.includes(currentId)) : false
  })
  const resumedRef = useRef(Boolean(resumable))
  void resumedRef

  // 初始值留空，由下面的 effect 赋值：渲染期调用 Date.now() 违反纯函数约束。
  const startedAt = useRef<number | null>(null)
  const finishedRef = useRef(false)
  /** 待执行的自动保存定时器；交卷时要立刻取消，否则会把已完成的会话又写回库。 */
  const autosaveTimer = useRef<number | null>(null)

  useEffect(() => {
    // 续做时沿用原会话的开始时间，这样「本次用时」是累计的，
    // 而不是每次打开都从零开始。
    if (startedAt.current === null) {
      startedAt.current = resumable?.startedAt ?? Date.now()
    }
  }, [resumable])

  const elapsed = useTimer(true)

  const current = sessionQuestions[index]
  const selection = current ? (answers[current.id] ?? EMPTY_SELECTION) : EMPTY_SELECTION
  const isChecked = current ? Boolean(checked[current.id]) : false

  const answeredCount = useMemo(
    () => sessionQuestions.filter((question) => (answers[question.id] ?? []).length > 0).length,
    [sessionQuestions, answers],
  )
  const reviewedCount = useMemo(
    () => sessionQuestions.filter((question) => checked[question.id]).length,
    [sessionQuestions, checked],
  )
  const correctCount = useMemo(
    () =>
      sessionQuestions.filter(
        (question) => checked[question.id] && isCorrect(question, answers[question.id] ?? []),
      ).length,
    [sessionQuestions, checked, answers],
  )

  const select = useCallback(
    (optionIndex: number) => {
      if (!current || checked[current.id]) return
      setAnswers((prev) => {
        const existing = prev[current.id] ?? EMPTY_SELECTION
        if (current.type === 'multiple') {
          const next = existing.includes(optionIndex)
            ? existing.filter((value) => value !== optionIndex)
            : [...existing, optionIndex].sort((a, b) => a - b)
          return { ...prev, [current.id]: next }
        }
        return { ...prev, [current.id]: [optionIndex] }
      })
    },
    [checked, current],
  )

  const submitQuestion = useCallback(() => {
    if (!current) return
    const picked = answers[current.id] ?? EMPTY_SELECTION
    if (picked.length === 0) return
    setChecked((prev) => ({ ...prev, [current.id]: true }))
    setShowAnalysis(true)
    if (!isCorrect(current, picked)) {
      recordWrong({
        questionId: current.id,
        collectionId: current.collectionId,
        lastSelection: picked,
      })
    } else if (mode === 'review') {
      removeWrong(current.id)
    }
  }, [answers, current, mode, recordWrong, removeWrong])

  const goNext = useCallback(() => {
    setIndex((value) => (value < sessionQuestions.length - 1 ? value + 1 : value))
    setShowAnalysis(false)
  }, [sessionQuestions.length])

  const goPrev = useCallback(() => {
    setIndex((value) => (value > 0 ? value - 1 : value))
    setShowAnalysis(false)
  }, [])

  const goTo = useCallback(
    (target: number) => {
      setIndex((value) => {
        const clamped = Math.min(Math.max(0, target), sessionQuestions.length - 1)
        return clamped === value ? value : clamped
      })
      setShowAnalysis(false)
    },
    [sessionQuestions.length],
  )

  const jumpToUnanswered = useCallback(() => {
    const target = sessionQuestions.findIndex(
      (question) => (answers[question.id] ?? EMPTY_SELECTION).length === 0,
    )
    if (target >= 0) goTo(target)
  }, [sessionQuestions, answers, goTo])

  /**
   * 交卷：只落一次记录。
   * 未核对的已答题（考试模式）在这里补记错题，已核对的不重复计入。
   */
  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    // 关键顺序：先取消待执行的自动保存，再清库里的会话。
    // 否则防抖定时器会在 clear 之后触发，把刚交的卷又写成「未完成」。
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }

    const started = startedAt.current ?? Date.now()
    const durationSec = Math.max(1, Math.round((Date.now() - started) / 1000))
    let correct = 0
    let answered = 0

    for (const question of sessionQuestions) {
      const picked = answers[question.id] ?? EMPTY_SELECTION
      if (picked.length === 0) continue
      answered += 1
      if (isCorrect(question, picked)) {
        correct += 1
      } else if (!checked[question.id]) {
        recordWrong({
          questionId: question.id,
          collectionId: question.collectionId,
          lastSelection: picked,
        })
      }
    }

    addHistory({
      id: `h_${Date.now()}`,
      mode,
      collectionId: historyCollectionId,
      collectionTitle: historyTitle,
      domainId: historyDomainId,
      answered,
      correct,
      wrong: answered - correct,
      skipped: sessionQuestions.length - answered,
      total: sessionQuestions.length,
      accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
      durationSec,
      finishedAt: Date.now(),
      dateKey: dateKey(Date.now()),
    })

    if (!historyCollectionId.startsWith('plan:')) {
      setLastCollection(historyCollectionId)
    }

    // 交卷即清掉未完成会话：这套题已经归档进练习记录，
    // 再提示「继续上次」会让用户做一遍已交过的卷子。
    clearPendingSession()

    const params = new URLSearchParams({
      mode,
      correct: String(correct),
      answered: String(answered),
      total: String(sessionQuestions.length),
      duration: String(durationSec),
      title: historyTitle,
      back: backTo,
    })
    navigate(`/result/${encodeURIComponent(historyCollectionId)}?${params.toString()}`)
  }, [
    sessionQuestions,
    answers,
    checked,
    mode,
    historyCollectionId,
    historyTitle,
    historyDomainId,
    addHistory,
    navigate,
    recordWrong,
    setLastCollection,
    clearPendingSession,
    backTo,
  ])

  // 倒计时归零时调用 finish，必须经 ref 拿最新实现，
  // 否则 useCountdown 的 effect 会因 finish 身份变化而反复重启计时。
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  const hasTimeLimit = mode === 'exam' && typeof timeLimitSec === 'number' && timeLimitSec > 0
  const { remaining: remainingLabel, remainingSec } = useCountdown(
    hasTimeLimit,
    hasTimeLimit ? (timeLimitSec as number) : 1,
    () => finishRef.current(),
  )

  // 顺序练习答对后自动进入下一题（可在设置中关闭）。
  useEffect(() => {
    if (!autoNext || mode !== 'practice') return undefined
    if (!current || !checked[current.id]) return undefined
    if (!isCorrect(current, answers[current.id] ?? EMPTY_SELECTION)) return undefined
    if (index >= sessionQuestions.length - 1) return undefined
    const timer = window.setTimeout(() => {
      setIndex((value) => value + 1)
      setShowAnalysis(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [autoNext, mode, current, checked, answers, index, sessionQuestions.length])

  // 自动保存进度：每次答案/核对状态/当前题变化都落库（防抖 400ms）。
  // 这是「切走再回来能继续」的唯一实现路径——组件卸载时不可靠地
  // 执行异步写入，浏览器也可能直接杀进程。
  useEffect(() => {
    if (finishedRef.current) return undefined
    if (sessionQuestions.length === 0) return undefined
    // 一题没答且停在第 1 题：还没真正开始，不写库，免得首页误报「继续上次」。
    if (Object.keys(answers).length === 0 && index === 0) return undefined

    autosaveTimer.current = window.setTimeout(() => {
      savePendingSession({
        id: `${historyCollectionId}:${mode}:${startedAt.current ?? 0}`,
        mode,
        collectionId: historyCollectionId,
        collectionTitle: historyTitle,
        domainId: historyDomainId,
        questionIds: sessionQuestions.map((question) => question.id),
        answers,
        checkedIds: Object.keys(checked).filter((id) => checked[id]),
        index,
        startedAt: startedAt.current ?? Date.now(),
        remainingSec: hasTimeLimit ? remainingSec : null,
        title: historyTitle,
      })
    }, 400)
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
      }
    }
  }, [
    answers,
    checked,
    index,
    sessionQuestions,
    mode,
    historyCollectionId,
    historyTitle,
    historyDomainId,
    hasTimeLimit,
    remainingSec,
    savePendingSession,
  ])

  const progress =
    sessionQuestions.length === 0
      ? 0
      : Math.round(((index + 1) / sessionQuestions.length) * 100)

  return {
    questions: sessionQuestions,
    current,
    index,
    total: sessionQuestions.length,
    answers,
    checked,
    selection,
    isChecked,
    showAnalysis,
    answeredCount,
    reviewedCount,
    correctCount,
    progress,
    elapsed,
    remainingLabel,
    remainingSec,
    timeCritical: hasTimeLimit && remainingSec <= 60,
    isLast: index === sessionQuestions.length - 1,
    select,
    submitQuestion,
    goNext,
    goPrev,
    goTo,
    jumpToUnanswered,
    finish,
  }
}
