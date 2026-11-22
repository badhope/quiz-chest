import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Question } from '../../data/types'
import { usePracticeSession } from '../../hooks/usePracticeSession'
import type { SessionMode } from '../../lib/quiz'
import { useAppStore } from '../../store/useAppStore'
import { AnswerCard } from './AnswerCard'
import { QuestionCard } from './QuestionCard'
import { SubmitDialog } from './SubmitDialog'
import { ArrowLeft, CircleHelp, Clock, Grid3x3, RotateCcw } from '../ui/icons'
import { ProgressBar } from '../ui/primitives'

const MODE_LABEL: Record<SessionMode, string> = {
  practice: '顺序练习',
  exam: '模拟考试',
  review: '错题重练',
}

export interface PracticeRunnerProps {
  questions: Question[]
  title: string
  subtitle?: string
  mode: SessionMode
  historyCollectionId: string
  historyTitle: string
  historyDomainId?: string
  backTo: string
  emptyHint?: string
  timeLimitSec?: number
}

/**
 * 练习 / 考试的统一运行器。
 *
 * 本组件只做三件事：把会话状态映射到界面、把用户操作转给会话 hook、
 * 在页面级组装子组件。业务规则在 `usePracticeSession`，单题视觉在
 * `QuestionCard`，答题卡在 `AnswerCard`，交卷确认在 `SubmitDialog`。
 */
export function PracticeRunner(props: PracticeRunnerProps) {
  const { title, subtitle, mode, backTo, emptyHint, timeLimitSec } = props
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)

  const session = usePracticeSession({
    questions: props.questions,
    mode,
    historyCollectionId: props.historyCollectionId,
    historyTitle: props.historyTitle,
    historyDomainId: props.historyDomainId,
    backTo,
    timeLimitSec,
  })

  const fontScale = useAppStore((state) => state.settings.fontScale)
  const favorites = useAppStore((state) => state.favorites)
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)

  const { current, select, goNext, submitQuestion, isChecked, selection, isLast } = session

  // 键盘作答：数字键选项、Enter 提交 / 下一题。输入框聚焦时不拦截。
  useEffect(() => {
    if (!current) return undefined
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const number = Number(event.key)
      if (Number.isInteger(number) && number >= 1 && number <= current.options.length) {
        select(number - 1)
        return
      }
      if (event.key !== 'Enter') return

      if (mode === 'exam') {
        if (!isLast) goNext()
        else setDialogOpen(true)
      } else if (!isChecked && selection.length > 0) {
        submitQuestion()
      } else if (isChecked) {
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, select, goNext, submitQuestion, isChecked, selection.length, mode, isLast])

  if (session.total === 0 || !current) {
    return (
      <div className="practice-missing">
        <h1>{emptyHint ?? '这里暂时没有题目'}</h1>
        <p>
          {mode === 'review'
            ? '答错的题会自动进入错题本，先去完成一次顺序练习吧。'
            : '换一个题库或练习策略试试。'}
        </p>
        <Link to={backTo} className="button button-primary button-sm">
          返回
        </Link>
      </div>
    )
  }

  const modeLabel = MODE_LABEL[mode]
  const hasTimer = mode === 'exam' && typeof timeLimitSec === 'number' && timeLimitSec > 0

  return (
    <div className={`practice-shell font-${fontScale}${outlineOpen ? ' outline-open' : ''}`}>
      <header className="practice-topbar">
        <button
          className="icon-button"
          onClick={() => {
            if (window.confirm('退出本次练习？当前作答不会保存。')) navigate(backTo)
          }}
          aria-label="退出练习"
        >
          <ArrowLeft />
        </button>
        <div className="practice-title">
          <span className="practice-mode">
            {modeLabel}
            {subtitle ? ` · ${subtitle}` : ''}
          </span>
          <strong>{title}</strong>
        </div>
        <div
          className={`practice-timer mono${session.timeCritical ? ' timer-critical' : ''}`}
          aria-label={hasTimer ? `剩余时间 ${session.remainingLabel}` : `已用时间 ${session.elapsed}`}
        >
          <Clock /> {hasTimer ? session.remainingLabel : session.elapsed}
        </div>
        <button
          className={`icon-button practice-outline-toggle${outlineOpen ? ' active' : ''}`}
          onClick={() => setOutlineOpen((value) => !value)}
          aria-label="答题卡"
          aria-expanded={outlineOpen}
        >
          <Grid3x3 />
        </button>
        <button
          className="button button-primary button-sm practice-submit"
          onClick={() => setDialogOpen(true)}
        >
          交卷
        </button>
      </header>

      <div className="practice-progress">
        <ProgressBar value={session.progress} label="答题进度" />
        <span className="mono">
          {session.index + 1} / {session.total}
        </span>
      </div>

      <main className="practice-main">
        <QuestionCard
          question={current}
          index={session.index}
          mode={mode}
          selection={session.selection}
          isChecked={session.isChecked}
          showAnalysis={session.showAnalysis}
          favorite={favorites.includes(current.id)}
          onToggleFavorite={() => toggleFavorite(current.id)}
          onSelect={session.select}
          onPrev={session.goPrev}
          onNext={session.goNext}
          onSubmit={session.submitQuestion}
          onRequestSubmit={() => setDialogOpen(true)}
          canGoPrev={session.index > 0}
          isLast={session.isLast}
        />

        <aside className="practice-aside">
          <div className="aside-block">
            <span className="aside-title">本次进度</span>
            <div className="aside-progress-row">
              <strong className="mono">{session.answeredCount}</strong>
              <span>/ {session.total} 已作答</span>
            </div>
            {mode === 'exam' ? null : (
              <div className="aside-progress-row">
                <strong className="mono">{session.correctCount}</strong>
                <span>题答对 / 已核对 {session.reviewedCount}</span>
              </div>
            )}
            <button
              className="aside-link"
              onClick={() => (mode === 'exam' ? setDialogOpen(true) : session.jumpToUnanswered())}
            >
              {mode === 'exam' ? '提前交卷' : '跳到未作答'}
            </button>
          </div>

          <AnswerCard
            questions={session.questions}
            answers={session.answers}
            checked={session.checked}
            currentIndex={session.index}
            open={outlineOpen}
            onToggle={() => setOutlineOpen((value) => !value)}
            onJump={(target) => {
              session.goTo(target)
              // 移动端抽屉在跳题后应自动收起，避免遮挡题干。
              if (window.matchMedia('(max-width: 560px)').matches) setOutlineOpen(false)
            }}
          />

          <div className="aside-tip">
            <CircleHelp />
            <p>
              {mode === 'exam'
                ? '考试模式不即时批改，交卷后统一查看得分与解析。'
                : '提交答案后立即查看解析，错题会自动收录到错题本。'}
            </p>
          </div>
        </aside>
      </main>

      <SubmitDialog
        open={dialogOpen}
        modeLabel={modeLabel}
        answered={session.answeredCount}
        total={session.total}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          setDialogOpen(false)
          session.finish()
        }}
      />

      {mode === 'review' ? (
        <div className="review-flag">
          <RotateCcw /> 错题重练答对后将从错题本中移除
        </div>
      ) : null}

      <div className="practice-footer-meta">
        {mode === 'exam' ? '保持专注，交卷后可查看完整解析' : '做完一题就立刻对答案，记得更牢'}
      </div>
    </div>
  )
}
