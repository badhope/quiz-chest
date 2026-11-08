import type { Question } from '../../data/types'
import { isCorrect } from '../../lib/quiz'
import { ChevronDown } from '../ui/icons'

export interface AnswerCardProps {
  questions: Question[]
  answers: Record<string, number[]>
  checked?: Record<string, boolean>
  currentIndex: number
  open: boolean
  onToggle: () => void
  onJump: (index: number) => void
}

/**
 * 答题卡。桌面端是侧栏内的折叠面板；≤560px 时随 `.outline-open`
 * 变成底部抽屉，因此开关状态必须由父级持有，不能内部自管。
 */
export function AnswerCard({
  questions,
  answers,
  checked,
  currentIndex,
  open,
  onToggle,
  onJump,
}: AnswerCardProps) {
  return (
    <div className="aside-block outline-block">
      <button className="aside-title-button" onClick={onToggle} aria-expanded={open}>
        <span className="aside-title">答题卡</span>
        <ChevronDown className={open ? ' flip' : ''} />
      </button>
      {open ? (
        <div className="outline-grid">
          {questions.map((question, questionIndex) => {
            const picked = (answers[question.id] ?? []).length > 0
            const done = Boolean(checked?.[question.id])
            const stateClass = done
              ? isCorrect(question, answers[question.id] ?? [])
                ? ' right'
                : ' wrong'
              : ''
            return (
              <button
                key={question.id}
                className={`outline-cell${picked ? ' picked' : ''}${stateClass}${
                  questionIndex === currentIndex ? ' current' : ''
                }`}
                onClick={() => onJump(questionIndex)}
                aria-label={`第 ${questionIndex + 1} 题${picked ? '，已作答' : '，未作答'}`}
                aria-current={questionIndex === currentIndex ? 'true' : undefined}
              >
                {questionIndex + 1}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
