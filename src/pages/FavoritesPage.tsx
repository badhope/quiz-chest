import { Link } from 'react-router-dom'
import { getCollection, getQuestion } from '../data'
import { useAppStore } from '../store/useAppStore'
import { formatRelativeTime } from '../lib/datetime'
import { Badge, EmptyState } from '../components/ui/primitives'
import { PageHeader } from '../components/ui/sections'
import { ArrowRight, Bookmark, Clock, Target, Trash2 } from '../components/ui/icons'

export function FavoritesPage() {
  const favorites = useAppStore((state) => state.favorites)
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const clearFavorites = useAppStore((state) => state.clearFavorites)
  const history = useAppStore((state) => state.history)

  const questions = favorites
    .map((id) => getQuestion(id))
    .filter((question): question is NonNullable<typeof question> => Boolean(question))
    .reverse()

  if (questions.length === 0) {
    return (
      <div className="favorites-page">
        <PageHeader eyebrow="我的收藏" title="把值得回看的题留在这里" />
        <EmptyState
          icon={<Bookmark />}
          title="还没有收藏"
          description="答题时点击右上角的书签按钮，就能把题目收进这里。"
          action={
            <Link to="/catalog" className="button button-primary button-sm">
              去题库挑题 <ArrowRight />
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="favorites-page">
      <PageHeader
        eyebrow="我的收藏"
        title={`${questions.length} 道题已收藏`}
        subtitle="按收藏顺序排列，可随时取消收藏或回到所属题库练习。"
        actions={
          <button
            className="button button-ghost button-sm"
            onClick={() => {
              if (window.confirm('清空全部收藏？该操作不可撤销。')) clearFavorites()
            }}
          >
            <Trash2 /> 清空收藏
          </button>
        }
      />

      <div className="favorite-list">
        {questions.map((question) => {
          const collection = getCollection(question.collectionId)
          const related = history.filter((entry) => entry.collectionId === question.collectionId)[0]
          return (
            <article className="favorite-item" key={question.id}>
              <div className="favorite-head">
                <div className="favorite-meta">
                  <Badge tone="neutral">{collection?.title ?? '未知题库'}</Badge>
                  <span className="favorite-time">
                    <Clock /> {related ? formatRelativeTime(related.finishedAt) : '最近收藏'}
                  </span>
                </div>
                <button
                  className="icon-button favorite-remove"
                  onClick={() => toggleFavorite(question.id)}
                  aria-label="取消收藏"
                >
                  <Bookmark />
                </button>
              </div>
              <p className="favorite-stem">{question.stem}</p>
              <div className="favorite-tags">
                {question.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="favorite-foot">
                <Link
                  to={`/collection/${question.collectionId}`}
                  className="text-link"
                >
                  进入题库 <ArrowRight />
                </Link>
                <span className="favorite-answer">
                  <Target /> 答案{' '}
                  {question.answer
                    .map((index) => String.fromCharCode(65 + index))
                    .join('、')}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
