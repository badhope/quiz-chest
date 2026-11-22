import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuestion } from '../data'
import { useAppStore } from '../store/useAppStore'
import { useLibraryCollections } from '../lib/library'
import { LETTERS, typeLabel } from '../lib/quiz'
import { compareByDue, dueCount, dueLabel } from '../lib/review'
import { AsyncButton } from '../components/ui/AsyncButton'
import { Badge, EmptyState } from '../components/ui/primitives'
import { PageHeader } from '../components/ui/sections'
import { ArrowRight, Bookmark, Target, RotateCcw, Trash2 } from '../components/ui/icons'
import { DomainIcon } from '../components/ui/icons'

export function WrongBookPage() {
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)
  const removeWrong = useAppStore((state) => state.removeWrong)
  const clearWrongBook = useAppStore((state) => state.clearWrongBook)
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const library = useLibraryCollections()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sort, setSort] = useState<'due' | 'recent' | 'count'>('due')
  const [collectionFilter, setCollectionFilter] = useState('all')

  const collectionOptions = useMemo(() => {
    const ids = new Set(Object.values(wrongBook).map((entry) => entry.collectionId))
    return library.filter((collection) => ids.has(collection.id))
  }, [library, wrongBook])

  const entries = useMemo(() => {
    const list = Object.values(wrongBook).filter(
      (entry) => getQuestion(entry.questionId) &&
        (collectionFilter === 'all' || entry.collectionId === collectionFilter),
    )
    return list.sort((a, b) => {
      if (sort === 'due') return compareByDue(a, b)
      return sort === 'count' ? b.wrongCount - a.wrongCount : b.lastWrongAt - a.lastWrongAt
    })
  }, [wrongBook, sort, collectionFilter])

  if (entries.length === 0) {
    return (
      <div className="wrong-page">
        <PageHeader eyebrow="错题本" title="错题会自动出现在这里" />
        <EmptyState
          icon={<Target />}
          title="还没有错题"
          description="练习时答错的题会自动收录，按错误次数排序，复习完可以标记掌握。"
          action={
            <Link to="/catalog" className="button button-primary button-sm">
              去练习 <ArrowRight />
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="wrong-page">
      <PageHeader
        eyebrow="错题本"
        title={`${entries.length} 道题等待复习`}
        subtitle={`今天到期 ${dueCount(entries)} 道，按 FSRS 记忆曲线安排复习；标记掌握后自动移出。`}
        actions={
          <div className="page-head-actions">
          <label className="wrong-filter">
            <span>题库</span>
            <select
              value={collectionFilter}
              onChange={(event) => {
                setCollectionFilter(event.target.value)
                setExpanded(null)
              }}
              aria-label="按题库筛选错题"
            >
              <option value="all">全部题库（{Object.keys(wrongBook).length}）</option>
              {collectionOptions.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title}（{Object.values(wrongBook).filter((entry) => entry.collectionId === collection.id).length}）
                </option>
              ))}
            </select>
          </label>
          <div className="segmented">
            <button className={sort === 'due' ? 'active' : ''} onClick={() => setSort('due')}>
              到期优先
            </button>
            <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>
              最近出错
            </button>
            <button className={sort === 'count' ? 'active' : ''} onClick={() => setSort('count')}>
              出错最多
            </button>
          </div>
          <AsyncButton
            confirmText="清空全部错题？该操作不可撤销。"
            busyLabel="清空中…"
            action={() => clearWrongBook()}
          >
            <Trash2 /> 清空
          </AsyncButton>
          </div>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="这个题库没有错题"
          description="切换筛选题库，或继续练习后再回来复习。"
        />
      ) : (
      <div className="wrong-list">
        {entries.map((entry) => {
          const question = getQuestion(entry.questionId)!
          const isOpen = expanded === entry.questionId
          const isFavorite = favorites.includes(question.id)
          return (
            <article key={entry.questionId} className={`wrong-item${isOpen ? ' open' : ''}`}>
              <button
                className="wrong-head"
                onClick={() => setExpanded(isOpen ? null : entry.questionId)}
                aria-expanded={isOpen}
              >
                <span className="wrong-count mono">×{entry.wrongCount}</span>
                <span className="wrong-stem">{question.stem}</span>
                <span className="wrong-meta">
                  <Badge tone="neutral">{typeLabel(question.type)}</Badge>
                  <Badge tone={dueLabel(entry) === '今天到期' ? 'gold' : 'neutral'}>
                    {dueLabel(entry)}
                  </Badge>
                </span>
              </button>
              {isOpen ? (
                <div className="wrong-body">
                  <div className="wrong-options">
                    {question.options.map((option, index) => (
                      <span
                        key={index}
                        className={`wrong-option${
                          question.answer.includes(index) ? ' correct' : ''
                        }${
                          entry.lastSelection.includes(index) && !question.answer.includes(index)
                            ? ' picked'
                            : ''
                        }`}
                      >
                        <span className="mono">{LETTERS[index]}</span>
                        {option}
                      </span>
                    ))}
                  </div>
                  <div className="wrong-analysis">
                    <h4>解析</h4>
                    <p>{question.explanation}</p>
                  </div>
                  <div className="wrong-actions">
                    <Link
                      to={`/collection/${question.collectionId}`}
                      className="button button-ghost button-sm"
                    >
                      <DomainIcon name="book" /> 返回题库
                    </Link>
                    <button
                      className="button button-ghost button-sm"
                      onClick={() => toggleFavorite(question.id)}
                    >
                      <Bookmark /> {isFavorite ? '取消收藏' : '收藏'}
                    </button>
                    <button
                      className="button button-primary button-sm"
                      onClick={() => removeWrong(question.id)}
                    >
                      <RotateCcw /> 标记已掌握
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
      )}

      <div className="wrong-foot">
        <Link to="/catalog" className="button button-primary button-sm">
          继续练习 <ArrowRight />
        </Link>
      </div>
    </div>
  )
}
