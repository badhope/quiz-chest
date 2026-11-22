import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getCollection, getQuestion } from '../data'

const questionById = getQuestion
import { useAppStore } from '../store/useAppStore'
import { formatDateTime } from '../lib/datetime'
import { formatDuration, parseSessionMode, percent, sessionModeLabel } from '../lib/quiz'
import { Badge } from '../components/ui/primitives'
import { MissingPage } from '../components/ui/MissingPage'
import { SectionHeader } from '../components/ui/sections'
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Flame,
  RotateCcw,
  Target,
  Trophy,
} from '../components/ui/icons'

export function ResultPage() {
  const { collectionId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const decodedId = decodeURIComponent(collectionId)
  const isPlan = decodedId.startsWith('plan:') || decodedId.startsWith('compose:')
  const collection = isPlan ? undefined : getCollection(decodedId)
  const history = useAppStore((state) => state.history)
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)

  const resultTitle = searchParams.get('title') ?? collection?.title ?? '策略练习'
  const mode = parseSessionMode(searchParams.get('mode'))
  const backTo = searchParams.get('back') ?? (collection ? `/collection/${collection.id}` : '/catalog')
  const correct = Number(searchParams.get('correct') ?? 0)
  const answered = Number(searchParams.get('answered') ?? 0)
  const total = Number(searchParams.get('total') ?? 0)
  const duration = Number(searchParams.get('duration') ?? 0)

  const accuracy = percent(correct, answered)
  const latest = history[0]

  const gained = useMemo(() => {
    if (!collection) return favorites.length
    return collection.questions.filter((question) => favorites.includes(question.id)).length
  }, [collection, favorites])

  if (!collection && !isPlan) {
    return (
      <MissingPage
        className="result-page"
        icon={<CircleHelp />}
        title="结果不存在"
        description="这次练习对应的题库已不存在，结果页无法还原。"
        to="/catalog"
        linkLabel="返回题库总览"
      />
    )
  }

  const wrongCount = answered - correct
  const skipped = total - answered
  const incomplete = total > 0 && answered < total * 0.6

  const verdict = incomplete
    ? {
        label: '本次未完成',
        tone: 'neutral',
        text: `共 ${total} 题，只作答了 ${answered} 题。正确率仅代表已作答部分，建议完整做完再评估。`,
      }
    : accuracy >= 90
      ? { label: '状态极佳', tone: 'success', text: '基础扎实，可以挑战更高难度的题库了。' }
      : accuracy >= 70
        ? { label: '稳步前进', tone: 'moss', text: '大部分考点已经掌握，重点复习错题即可。' }
        : accuracy >= 50
          ? { label: '仍需巩固', tone: 'gold', text: '建议回到解析，把错题对应的知识点重新过一遍。' }
          : { label: '从头梳理', tone: 'danger', text: '先慢下来理解概念，再做一次顺序练习。' }

  return (
    <div className="result-page">
      <header className="result-hero">
        <span className="result-kicker">{sessionModeLabel(mode)} · 已完成</span>
        <div className="result-score">
          <strong className="mono">{accuracy}</strong>
          <span>%</span>
        </div>
        <h1 className="serif">{verdict.label}</h1>
        <p>{verdict.text}</p>
        <div className="result-badges">
          <Badge tone={verdict.tone as 'success' | 'moss' | 'gold' | 'danger' | 'neutral'}>
            {resultTitle}
          </Badge>
          <Badge tone="neutral">{latest ? formatDateTime(latest.finishedAt) : '刚刚'}</Badge>
        </div>
      </header>

      <section className="result-grid">
        <div className="result-stat">
          <CircleCheck />
          <strong className="mono">{correct}</strong>
          <span>答对</span>
        </div>
        <div className="result-stat">
          <CircleX />
          <strong className="mono">{wrongCount}</strong>
          <span>答错</span>
        </div>
        <div className="result-stat">
          <CircleHelp />
          <strong className="mono">{skipped}</strong>
          <span>跳过</span>
        </div>
        <div className="result-stat">
          <Clock />
          <strong className="mono">{formatDuration(duration)}</strong>
          <span>用时</span>
        </div>
      </section>

      <section className="result-detail">
        <div className="result-detail-head">
          <div>
            <span className="eyebrow">本次表现</span>
            <h2 className="serif">正确率 {accuracy}%</h2>
          </div>
          <div className="result-detail-meta">
            <span>
              <Target /> 共 {total} 题
            </span>
            <span>
              <Flame /> 错题已收录 {wrongCount} 题
            </span>
          </div>
        </div>
        <div className="accuracy-scale">
          <div className="accuracy-track">
            <span style={{ width: `${accuracy}%` }} />
            <i style={{ left: '70%' }} />
          </div>
          <div className="accuracy-labels">
            <span>0</span>
            <span>70% 掌握线</span>
            <span>100%</span>
          </div>
        </div>
        <div className="result-notes">
          <div>
            <h3>下一步</h3>
            <p>
              {wrongCount > 0
                ? `有 ${wrongCount} 道错题已加入错题本，建议 24 小时内复习一次。`
                : '本次没有错题，可以尝试模拟考试模式检验稳定性。'}
            </p>
          </div>
          <div>
            <h3>收藏</h3>
            <p>
            {isPlan
              ? `本次策略练习涉及 ${total} 题，收藏与错题已分别归档。`
              : `你在本库共收藏了 ${gained} 道题，可在「我的收藏」集中回顾。`}
          </p>
          </div>
          <div>
            <h3>连续练习</h3>
            <p>
              保持每日练习，累计记录会显示在「学习统计」里。当前错题本共{' '}
              {Object.keys(wrongBook).length} 题。
            </p>
          </div>
        </div>
      </section>

      <div className="result-actions">
        <Link to={backTo} className="button button-ghost">
          返回
        </Link>
        <Link to="/review?tab=wrong" className="button button-ghost">
          <RotateCcw /> 错题本
        </Link>
        <Link to={backTo} className="button button-primary">
          再练一次 <ArrowRight />
        </Link>
      </div>

      <section className="result-review">
        <SectionHeader
          eyebrow="错题回顾"
          title="把错的地方看明白"
          aside={
            <Link to="/review?tab=wrong" className="section-link">
              打开错题本 <ArrowRight />
            </Link>
          }
        />
        {wrongCount === 0 ? (
          <div className="result-perfect">
            <Trophy />
            <p>
              {skipped > 0
                ? `已作答的 ${answered} 题全部正确，还有 ${skipped} 题未作答，建议补齐后再看整体掌握度。`
                : '全对。这组题的知识点已经过关，换一组继续扩展边界。'}
            </p>
          </div>
        ) : (
          <div className="result-review-list">
            {history
              .slice(0, 1)
              .flatMap(() => Object.values(wrongBook))
              .slice(0, 5)
              .map((entry) => questionById(entry.questionId))
              .filter((question): question is NonNullable<typeof question> => Boolean(question))
              .map((question) => (
                <div key={question.id} className="result-review-item">
                  <span className="review-index mono">Q</span>
                  <div>
                    <strong>{question.stem}</strong>
                    <p>{question.explanation}</p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {latest ? (
        <p className="result-footnote">
          最近一次记录已保存 · {formatDateTime(latest.finishedAt)}
        </p>
      ) : null}
    </div>
  )
}
