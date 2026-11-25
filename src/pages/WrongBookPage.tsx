import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuestion } from '../data'
import { useAppStore } from '../store/useAppStore'
import { useLibraryCollections } from '../lib/library'
import { LETTERS, typeLabel } from '../lib/quiz'
import { compareByDue, dueCount, dueForecast, dueLabel, ERROR_REASON_LABELS } from '../lib/review'
import { AsyncButton } from '../components/ui/AsyncButton'
import { Badge, EmptyState } from '../components/ui/primitives'
import { PageHeader } from '../components/ui/sections'
import { ArrowRight, Bookmark, Check, CircleAlert, Target, RotateCcw, Trash2 } from '../components/ui/icons'
import { DomainIcon } from '../components/ui/icons'

export function WrongBookPage() {
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)
  const removeWrong = useAppStore((state) => state.removeWrong)
  const updateWrongMeta = useAppStore((state) => state.updateWrongMeta)
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

  const forecast = useMemo(() => dueForecast(entries), [entries])

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
        subtitle={`今天到期 ${dueCount(entries)} 道，按 FSRS 记忆曲线安排复习；标记掌握后自动移出。给错题标错因、写一句笔记，复习时先想起自己为什么错。`}
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

      <section className="wrong-forecast" aria-label="未来七天复习到期">
        <div className="wrong-forecast-head">
          <span className="eyebrow">未来 7 天到期</span>
          <strong>今天先处理 {forecast[0]?.count ?? 0} 道</strong>
        </div>
        <div className="wrong-forecast-list">
          {forecast.map((day) => (
            <div key={day.dateKey} className={`wrong-day${day.count === 0 ? ' empty' : ''}${day.overdue && day.count > 0 ? ' overdue' : ''}`}>
              <strong className="mono">{day.count}</strong>
              <span>{day.label}</span>
              <small className="mono">{day.dateKey}</small>
            </div>
          ))}
        </div>
      </section>

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
                  {entry.reason ? <Badge tone="gold" outline>{ERROR_REASON_LABELS[entry.reason]}</Badge> : null}
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
                  <WrongMetaEditor
                    entry={entry}
                    onChange={(patch) => updateWrongMeta(entry.questionId, patch)}
                  />
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


function WrongMetaEditor({
  entry,
  onChange,
}: {
  entry: { reason?: keyof typeof ERROR_REASON_LABELS; note?: string }
  onChange: (patch: { reason?: keyof typeof ERROR_REASON_LABELS | null; note?: string }) => void
}) {
  const [note, setNote] = useState(entry.note ?? '')
  const [saved, setSaved] = useState(false)
  const reasons = Object.entries(ERROR_REASON_LABELS) as Array<[keyof typeof ERROR_REASON_LABELS, string]>
  return (
    <div className="wrong-meta-editor">
      <div className="wrong-reasons">
        <span className="wrong-meta-label">错因</span>
        {reasons.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`wrong-reason${entry.reason === key ? ' active' : ''}`}
            onClick={() => onChange({ reason: entry.reason === key ? null : key })}
          >
            {entry.reason === key ? <Check /> : <CircleAlert />}
            {label}
          </button>
        ))}
      </div>
      <label className="wrong-note">
        <span className="wrong-meta-label">我的笔记</span>
        <textarea
          rows={2}
          maxLength={200}
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
            setSaved(false)
          }}
          placeholder="记一句：是公式记错了、题干看漏了，还是时间不够？"
        />
      </label>
      <div className="wrong-note-actions">
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={() => {
            onChange({ note })
            setSaved(true)
          }}
          disabled={note === (entry.note ?? '')}
        >
          保存笔记
        </button>
        <span role="status">{saved ? '笔记已保存到本机。' : '只保存在本机，随全量备份恢复。'}</span>
      </div>
    </div>
  )
}
