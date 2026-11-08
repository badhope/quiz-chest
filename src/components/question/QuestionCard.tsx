import type { Question } from '../../data/types'
import { isCorrect, LETTERS, typeLabel, type SessionMode } from '../../lib/quiz'
import { ArrowLeft, ArrowRight, Bookmark, ChevronDown, CircleCheck, CircleX } from '../ui/icons'
import { Badge } from '../ui/primitives'

export interface QuestionCardProps {
  question: Question
  index: number
  mode: SessionMode
  selection: number[]
  isChecked: boolean
  showAnalysis: boolean
  favorite: boolean
  canGoPrev: boolean
  isLast: boolean
  onToggleFavorite: () => void
  onSelect: (optionIndex: number) => void
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void
  onRequestSubmit: () => void
}

/**
 * 单题展示与作答区。纯受控组件：所有状态由 `usePracticeSession` 提供，
 * 这里只做视觉呈现与事件上抛，不持有业务状态。
 */
export function QuestionCard({
  question,
  index,
  mode,
  selection,
  isChecked,
  showAnalysis,
  favorite,
  canGoPrev,
  isLast,
  onToggleFavorite,
  onSelect,
  onPrev,
  onNext,
  onSubmit,
  onRequestSubmit,
}: QuestionCardProps) {
  const answeredCorrectly = isCorrect(question, selection)
  const showAnswer = isChecked && mode !== 'exam'

  return (
    <article className="question-card" aria-live="polite">
      <div className="question-meta">
        <Badge tone="accent">{typeLabel(question.type)}</Badge>
        <Badge tone="neutral">难度 {'●'.repeat(question.difficulty)}</Badge>
        <span className="question-id mono">Q{String(index + 1).padStart(2, '0')}</span>
        <button
          className={`favorite-button${favorite ? ' active' : ''}`}
          onClick={onToggleFavorite}
          aria-label={favorite ? '取消收藏' : '收藏本题'}
          aria-pressed={favorite}
        >
          <Bookmark />
        </button>
      </div>

      <h1 className="question-stem">{question.stem}</h1>
      {question.image ? (
        <figure className="question-figure">
          <img src={question.image} alt="题干配图" loading="lazy" />
        </figure>
      ) : null}
      <p className="question-hint">
        {question.type === 'multiple' ? '多选题：选出全部正确选项' : '请选择一个答案'}
        <span className="keyboard-hint">
          {mode === 'exam'
            ? ` · 键盘 1-${question.options.length} 选择，Enter 进入下一题`
            : ` · 键盘 1-${question.options.length} 选择，Enter 提交`}
        </span>
      </p>

      <div className="options" role="group" aria-label="选项">
        {question.options.map((option, optionIndex) => {
          const picked = selection.includes(optionIndex)
          const correctOption = question.answer.includes(optionIndex)
          const state = isChecked
            ? correctOption
              ? 'correct'
              : picked
                ? 'wrong'
                : 'idle'
            : picked
              ? 'picked'
              : 'idle'
          return (
            <button
              key={optionIndex}
              className={`option option-${state}`}
              onClick={() => onSelect(optionIndex)}
              aria-pressed={picked}
              disabled={isChecked && mode !== 'exam'}
            >
              <span className="option-letter mono">{LETTERS[optionIndex]}</span>
              <span className="option-text">
                {option}
                {question.optionImages?.[optionIndex] ? (
                  <img
                    className="option-image"
                    src={question.optionImages[optionIndex]}
                    alt={`选项 ${LETTERS[optionIndex]} 配图`}
                    loading="lazy"
                  />
                ) : null}
              </span>
              {isChecked && correctOption ? <CircleCheck className="option-mark" /> : null}
              {isChecked && picked && !correctOption ? <CircleX className="option-mark" /> : null}
            </button>
          )
        })}
      </div>

      {showAnswer ? (
        <section className={`analysis${showAnalysis ? ' open' : ''}`} aria-label="答案解析">
          <header className="analysis-head">
            <span className={answeredCorrectly ? 'ok' : 'bad'}>
              {answeredCorrectly ? <CircleCheck /> : <CircleX />}
              {answeredCorrectly ? '回答正确' : '回答错误'}
            </span>
            <span className="analysis-answer">
              正确答案：
              <strong className="mono">
                {question.answer.map((value) => LETTERS[value]).join('、')}
              </strong>
            </span>
          </header>
          <div className="analysis-body">
            <h3>解析</h3>
            <p>{question.explanation}</p>
            <div className="analysis-tags">
              {question.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="question-actions">
        <button className="button button-ghost" onClick={onPrev} disabled={!canGoPrev}>
          <ArrowLeft /> 上一题
        </button>
        {!isChecked && mode !== 'exam' ? (
          <button
            className="button button-primary"
            onClick={onSubmit}
            disabled={selection.length === 0}
          >
            确认答案 <ChevronDown className="rotate-icon" />
          </button>
        ) : null}
        {isChecked || mode === 'exam' ? (
          <button
            className="button button-primary"
            onClick={isLast ? onRequestSubmit : onNext}
          >
            {isLast ? '完成练习' : '下一题'} <ArrowRight />
          </button>
        ) : null}
      </div>
    </article>
  )
}
