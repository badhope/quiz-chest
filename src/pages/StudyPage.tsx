import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { LibraryCollection } from '../lib/library'
import { useLibraryCollections } from '../lib/library'
import { answerLabel, LETTERS, typeLabel } from '../lib/quiz'
import { useAppStore } from '../store/useAppStore'
import { Badge, ProgressBar } from '../components/ui/primitives'
import { MissingPage } from '../components/ui/MissingPage'
import { ArrowLeft, ArrowRight, BookOpen, RotateCcw } from '../components/ui/icons'

/**
 * 背题模式：先看题，再翻答案。
 *
 * 和练习不同，这里不判分、不写入正确率，也不占用 FSRS 的复习记录。
 * 它解决的是「还没到做题阶段，先把知识点过一遍」的场景；做完题的人也可以
 * 用它快速回看解析，而不是再点一遍选项。
 */
export function StudyPage() {
  const { collectionId = '' } = useParams()
  const collection = useLibraryCollections().find((item) => item.id === collectionId)

  if (!collection) {
    return (
      <MissingPage
        icon={<BookOpen />}
        title="题库不存在"
        description="该题库可能已被调整，请返回题库总览重新选择。"
        to="/catalog"
        linkLabel="返回题库总览"
      />
    )
  }

  return <StudyRunner key={collection.id} collection={collection} />
}

function StudyRunner({ collection }: { collection: LibraryCollection }) {
  const navigate = useNavigate()
  const favoriteIds = useAppStore((state) => state.favorites)
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const questions = collection.questions
  const [order, setOrder] = useState<number[]>(() => questions.map((_, index) => index))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [viewed, setViewed] = useState<Set<string>>(new Set())

  const question = useMemo(() => questions[order[index] ?? index], [index, order, questions])

  useEffect(() => {
    if (!question) return undefined
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setRevealed(false)
        setIndex((value) => Math.min(questions.length - 1, value + 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setRevealed(false)
        setIndex((value) => Math.max(0, value - 1))
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        setRevealed((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, questions.length])

  if (!question) {
    return (
      <MissingPage
        icon={<BookOpen />}
        title="这里暂时没有题目"
        description="换一个题库，或先导入自己的题库。"
        to={`/collection/${collection.id}`}
        linkLabel="返回题库"
      />
    )
  }

  const reveal = () => {
    setRevealed(true)
    setViewed((current) => new Set(current).add(question.id))
  }
  const go = (delta: number) => {
    setRevealed(false)
    setIndex((value) => Math.max(0, Math.min(questions.length - 1, value + delta)))
  }
  const shuffle = () => {
    const next = [...order]
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    setOrder(next)
    setIndex(0)
    setRevealed(false)
  }
  const isText = question.type === 'fill' || question.type === 'short'
  const answerText = isText
    ? answerLabel(question)
    : question.answer.map((optionIndex) => question.options[optionIndex]).filter(Boolean).join(' / ')

  return (
    <div className="study-page">
      <header className="study-topbar">
        <button
          className="icon-button"
          onClick={() => navigate(`/collection/${collection.id}`)}
          aria-label="返回题库"
        >
          <ArrowLeft />
        </button>
        <div className="study-title-block">
          <span className="eyebrow">背题模式 · 不判分</span>
          <h1 className="serif">{collection.title}</h1>
        </div>
        <div className="study-progress-block">
          <span className="mono">
            {index + 1} / {questions.length}
          </span>
          <ProgressBar value={((index + 1) / questions.length) * 100} label="背题进度" />
        </div>
        <button className="button button-ghost button-sm" onClick={shuffle} title="打乱题序">
          <RotateCcw /> 打乱
        </button>
      </header>

      <main className="study-main">
        <article className="study-card">
          <div className="study-card-meta">
            <Badge tone="neutral">{typeLabel(question.type)}</Badge>
            <span>{question.tags.join(' · ')}</span>
          </div>
          <h2 className="study-stem">{question.stem}</h2>

          {question.image ? (
            <img className="study-figure" src={question.image} alt="题干配图" />
          ) : null}

          {isText ? (
            <div className="study-text-question">
              <span className="mono">{question.type === 'fill' ? '填空题' : '简答题'}</span>
              <p>
                {revealed
                  ? '答案在下方，对照参考答案回忆一遍。'
                  : '这是一道文本题，先在心里作答，再点「显示答案」。'}
              </p>
            </div>
          ) : (
          <div className="study-options">
            {question.options.map((option, optionIndex) => (
              <div
                key={optionIndex}
                className={`study-option${revealed && question.answer.includes(optionIndex) ? ' correct' : ''}`}
              >
                <span className="mono study-option-letter">{LETTERS[optionIndex]}</span>
                <span>{option}</span>
                {question.optionImages?.[optionIndex] ? (
                  <img src={question.optionImages[optionIndex]} alt={`选项 ${LETTERS[optionIndex]}`} />
                ) : null}
              </div>
            ))}
          </div>
          )}

          <div className="study-reveal-row">
            <button
              className={`button ${revealed ? 'button-ghost' : 'button-primary'}`}
              onClick={() => (revealed ? setRevealed(false) : reveal())}
            >
              {revealed ? '收起答案' : '显示答案'}
            </button>
            <button
              className="button button-ghost button-sm"
              onClick={() => toggleFavorite(question.id)}
            >
              {favoriteIds.includes(question.id) ? '已收藏' : '收藏这道题'}
            </button>
            {revealed ? (
              <span className="study-answer-label">
                {question.type === 'short' ? '参考答案' : '正确答案'}：{answerText || '见解析'}
              </span>
            ) : null}
          </div>

          {revealed ? (
            <section className="study-answer" aria-live="polite">
              {question.type === 'short' && question.keywords?.length ? (
                <p className="study-keywords">判分关键词：{question.keywords.join('、')}</p>
              ) : null}
              <h3>解析</h3>
              <p>{question.explanation}</p>
            </section>
          ) : (
            <p className="study-hint">先自己想一想，再点「显示答案」。看过的题不会写入正确率。</p>
          )}
        </article>

        <nav className="study-nav" aria-label="背题导航">
          <button className="button button-ghost" onClick={() => go(-1)} disabled={index === 0}>
            <ArrowLeft /> 上一题
          </button>
          <Link to={`/collection/${collection.id}`} className="text-link">
            退出背题
          </Link>
          <button
            className="button button-primary"
            onClick={() => go(1)}
            disabled={index >= questions.length - 1}
          >
            下一题 <ArrowRight />
          </button>
        </nav>

        <p className="study-foot">
          已看 {viewed.size} / {questions.length} 题。背题只是过知识点，想要系统安排复习，去错题本或做一次练习。
        </p>
      </main>
    </div>
  )
}
