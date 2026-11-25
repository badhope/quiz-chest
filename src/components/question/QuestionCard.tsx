import type { Question } from '../../data/types'
import { answerLabel, isCorrect, LETTERS, normalizeAnswerText, typeLabel, type SessionMode } from '../../lib/quiz'
import { ArrowLeft, ArrowRight, Bookmark, ChevronDown, CircleCheck, CircleX, Sparkles } from '../ui/icons'
import { Badge } from '../ui/primitives'
import { RemoteImage } from '../ui/RemoteImage'

export interface QuestionCardProps {
  question: Question
  index: number
  mode: SessionMode
  selection: number[]
  textAnswer: string
  isChecked: boolean
  showAnalysis: boolean
  favorite: boolean
  canGoPrev: boolean
  isLast: boolean
  onToggleFavorite: () => void
  onSelect: (optionIndex: number) => void
  onTextChange: (value: string) => void
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void
  onRequestSubmit: () => void
  onAskTutor: () => void
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
  textAnswer,
  isChecked,
  showAnalysis,
  favorite,
  canGoPrev,
  isLast,
  onToggleFavorite,
  onSelect,
  onTextChange,
  onPrev,
  onNext,
  onSubmit,
  onRequestSubmit,
  onAskTutor,
}: QuestionCardProps) {
  const isText = question.type === 'fill' || question.type === 'short'
  const answeredCorrectly = isCorrect(question, selection, textAnswer)
  const hasAnswer = selection.length > 0 || textAnswer.trim().length > 0
  const showAnswer = isChecked && mode !== 'exam'
  const submittedText = normalizeAnswerText(textAnswer)
  const missingKeywords = (question.keywords ?? []).filter(
    (keyword) => !submittedText.includes(normalizeAnswerText(keyword)),
  )
  const resultLabel =
    question.type === 'short'
      ? question.keywords?.length
        ? answeredCorrectly
          ? '关键词全部命中'
          : '关键词没覆盖全'
        : answeredCorrectly
          ? '与参考答案一致'
          : '与参考答案不一致'
      : question.type === 'fill'
        ? answeredCorrectly
          ? '填写正确'
          : '填写错误'
        : answeredCorrectly
          ? '回答正确'
          : '回答错误'

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
          <RemoteImage src={question.image} alt="题干配图" />
        </figure>
      ) : null}
      <p className="question-hint">
        {question.type === 'multiple'
          ? '多选题：选出全部正确选项'
          : question.type === 'fill'
            ? '填空题：填写答案，系统按预设答案判分'
            : question.type === 'short'
              ? '简答题：按判分关键词评分，答出全部关键词才算对'
              : '请选择一个答案'}
        <span className="keyboard-hint">
          {isText
            ? question.type === 'short'
              ? ' · Ctrl+Enter 提交'
              : ' · Enter 提交'
            : mode === 'exam'
              ? ` · 键盘 1-${question.options.length} 选择，Enter 进入下一题`
              : ` · 键盘 1-${question.options.length} 选择，Enter 提交`}
        </span>
      </p>

      {isText ? (
        <div className="text-answer">
          {question.type === 'fill' ? (
            <input
              className="text-answer-input"
              type="text"
              value={textAnswer}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  if (!isChecked && mode !== 'exam' && textAnswer.trim()) onSubmit()
                }
              }}
              placeholder="在这里填写答案"
              aria-label="填写答案"
              disabled={isChecked && mode !== 'exam'}
              autoComplete="off"
            />
          ) : (
            <textarea
              className="text-answer-area"
              value={textAnswer}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  if (!isChecked && mode !== 'exam' && textAnswer.trim()) onSubmit()
                }
              }}
              rows={4}
              maxLength={1200}
              placeholder="写下你的答案，再对照参考答案"
              aria-label="填写简答答案"
              disabled={isChecked && mode !== 'exam'}
            />
          )}
          <div className="text-answer-foot">
            <span>{textAnswer.length} 字</span>
            {isChecked ? <span>已提交，答案已锁定</span> : <span>答案只保存在本机</span>}
          </div>
        </div>
      ) : (
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
                    <RemoteImage
                      className="option-image"
                      src={question.optionImages[optionIndex]}
                      alt={`选项 ${LETTERS[optionIndex]} 配图`}
                    />
                  ) : null}
                </span>
                {isChecked && correctOption ? <CircleCheck className="option-mark" /> : null}
                {isChecked && picked && !correctOption ? <CircleX className="option-mark" /> : null}
              </button>
            )
          })}
        </div>
      )}

      {showAnswer ? (
        <section className={`analysis${showAnalysis ? ' open' : ''}`} aria-label="答案解析">
          <header className="analysis-head">
            <span className={answeredCorrectly ? 'ok' : 'bad'}>
              {answeredCorrectly ? <CircleCheck /> : <CircleX />}
              {resultLabel}
            </span>
            <span className="analysis-answer">
              {question.type === 'fill' ? '正确答案：' : question.type === 'short' ? '参考答案：' : '正确答案：'}
              <strong className="mono">{answerLabel(question)}</strong>
            </span>
            <button
              className="tutor-ask tutor-ask-head"
              onClick={onAskTutor}
              aria-label="问小星：让本机模型讲讲这道题"
            >
              <Sparkles />
              <span>
                <strong>问小星</strong>
                讲讲这道题
              </span>
            </button>
          </header>
          <div className="analysis-body">
            {question.type === 'short' && question.keywords?.length ? (
              <p className="analysis-keywords">
                判分关键词：{question.keywords.join('、')}
                {!answeredCorrectly && missingKeywords.length
                  ? ` · 这次没写到：${missingKeywords.join('、')}`
                  : ''}
              </p>
            ) : null}
            {question.type === 'fill' && (question.answerText?.length ?? 0) > 1 ? (
              <p className="analysis-keywords">可接受答案：{question.answerText?.join(' / ')}</p>
            ) : null}
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
            disabled={!hasAnswer}
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
