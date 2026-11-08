import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { domains } from '../data/taxonomy'
import { useAppStore } from '../store/useAppStore'
import { useLibraryCollections, type LibraryCollection } from '../lib/library'
import { Badge, EmptyState, ProgressBar } from '../components/ui/primitives'
import { DomainIcon } from '../components/ui/icons'
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  PenLine,
  RotateCcw,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from '../components/ui/icons'

export function CollectionPage() {
  const { collectionId = '' } = useParams()
  const libraryMatch: LibraryCollection | undefined = useLibraryCollections().find(
    (item) => item.id === collectionId,
  )
  const collection: LibraryCollection | undefined = libraryMatch
  const history = useAppStore((state) => state.history)
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)

  const records = useMemo(
    () => history.filter((entry) => entry.collectionId === collectionId),
    [history, collectionId],
  )

  if (!collection) {
    return (
      <EmptyState
        icon={<Layers />}
        title="题库不存在"
        description="该题库可能已被调整，请返回题库总览重新选择。"
        action={
          <Link to="/catalog" className="button button-primary button-sm">
            返回题库总览
          </Link>
        }
      />
    )
  }

  const domain = domains.find((item) => item.id === collection.domainId) ?? (collection.origin === 'imported'
    ? { name: '我的题库', accent: collection.accent }
    : undefined)
  const wrongCount = collection.questions.filter((question) => wrongBook[question.id]).length
  const favoriteCount = collection.questions.filter((question) => favorites.includes(question.id)).length
  const bestAccuracy = records.reduce((best, entry) => Math.max(best, entry.accuracy), 0)
  const answeredCount = records.reduce((sum, entry) => sum + entry.answered, 0)
  const lastRecord = records[0]
  const mastery = records.length ? Math.round((bestAccuracy + Math.min(100, records.length * 12)) / 2) : 0

  const typeCount = {
    single: collection.questions.filter((q) => q.type === 'single').length,
    multiple: collection.questions.filter((q) => q.type === 'multiple').length,
    judge: collection.questions.filter((q) => q.type === 'judge').length,
  }

  return (
    <div className="collection-page" style={{ '--domain-accent': domain?.accent } as React.CSSProperties}>
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/catalog">题库总览</Link>
        <ChevronRight />
        <Link to={`/domain/${collection.domainId}`}>{domain?.name}</Link>
        <ChevronRight />
        <span>{collection.title}</span>
      </nav>

      <header className="collection-hero">
        <div className="collection-hero-main">
          <span className="collection-hero-icon">
            <DomainIcon name={collection.icon} />
          </span>
          <div>
            <div className="collection-hero-badges">
              <Badge tone="accent">{collection.exam}</Badge>
              <Badge tone="neutral">{collection.level}</Badge>
              <Badge tone="moss">更新于 {collection.updated}</Badge>
              {collection.origin === 'builtin' ? (
                <Badge tone="gold" outline>
                  示例题库 · 非正式教材
                </Badge>
              ) : (
                <Badge tone="gold" outline>
                  我的导入
                </Badge>
              )}
            </div>
            <h1 className="page-title serif">{collection.title}</h1>
            <p className="page-sub">{collection.description}</p>
          </div>
        </div>
        <div className="collection-hero-stats">
          <div>
            <span>题目数</span>
            <strong className="mono">{collection.questions.length}</strong>
          </div>
          <div>
            <span>建议用时</span>
            <strong className="mono">{collection.durationMin} 分钟</strong>
          </div>
          <div>
            <span>热度</span>
            <strong className="mono">{collection.heat}°</strong>
          </div>
          <div>
            <span>我的正确率</span>
            <strong className="mono">{records.length ? `${bestAccuracy}%` : '—'}</strong>
          </div>
        </div>
      </header>

      <div className="practice-launch">
        <div className="launch-primary">
          <div className="launch-copy">
            <span className="eyebrow">开始练习</span>
            <h2 className="serif">
              {lastRecord ? '继续巩固，刷新最好成绩' : '按自己的节奏，一题一题吃透'}
            </h2>
            <p>
              单选、多选、判断共 {collection.questions.length} 题，提交后立即查看解析，
              错题会自动进入错题本。
            </p>
          </div>
          <div className="launch-actions">
            <Link
              to={`/practice/${collection.id}?mode=practice`}
              className="button button-primary"
            >
              <Zap />
              顺序练习
            </Link>
            <Link
              to={`/practice/${collection.id}?mode=exam`}
              className="button button-ghost"
            >
              <Trophy />
              模拟考试
            </Link>
            {wrongCount > 0 ? (
              <Link
                to={`/practice/${collection.id}?mode=review`}
                className="button button-ghost"
              >
                <RotateCcw />
                错题重练 · {wrongCount}
              </Link>
            ) : null}
            {collection.origin === 'imported' ? (
              <Link to={`/edit/${collection.id}`} className="button button-ghost">
                <PenLine />
                编辑题库
              </Link>
            ) : null}
          </div>
        </div>
        <aside className="launch-side">
          <span className="launch-side-label">掌握度</span>
          <div className="launch-side-value mono">{mastery}%</div>
          <ProgressBar value={mastery} tone="moss" label="掌握度" />
          <ul className="launch-facts">
            <li>
              <Target /> 已作答 {answeredCount} 次
            </li>
            <li>
              <Bookmark /> 收藏 {favoriteCount} 题
            </li>
            <li>
              <Flame /> 错题 {wrongCount} 题
            </li>
          </ul>
        </aside>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">题目构成</span>
            <h2 className="section-title serif">先了解这份题库</h2>
          </div>
        </div>
        <div className="composition-grid">
          <div className="composition-card">
            <span className="composition-icon accent">
              <Layers />
            </span>
            <strong>{typeCount.single}</strong>
            <span>单选题</span>
          </div>
          <div className="composition-card">
            <span className="composition-icon moss">
              <TrendingUp />
            </span>
            <strong>{typeCount.multiple}</strong>
            <span>多选题</span>
          </div>
          <div className="composition-card">
            <span className="composition-icon gold">
              <Target />
            </span>
            <strong>{typeCount.judge}</strong>
            <span>判断题</span>
          </div>
          <div className="composition-card">
            <span className="composition-icon neutral">
              <Clock />
            </span>
            <strong>{collection.durationMin}</strong>
            <span>建议分钟</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">考点标签</span>
            <h2 className="section-title serif">这份题库覆盖什么</h2>
          </div>
        </div>
        <div className="tag-cloud">
          {collection.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
          <span className="tag-chip muted">{collection.exam}</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">我的记录</span>
            <h2 className="section-title serif">最近练习</h2>
          </div>
          <Link to="/history" className="section-link">
            全部记录 <ChevronRight />
          </Link>
        </div>
        {records.length === 0 ? (
          <EmptyState
            icon={<Trophy />}
            title="还没有练过这个题库"
            description="完成一次练习后，这里会记录你的正确率、用时和错题数量。"
          />
        ) : (
          <div className="record-table">
            {records.slice(0, 5).map((entry) => (
              <div className="record-row" key={entry.id}>
                <span className="record-mode">
                  {entry.mode === 'exam' ? '模拟考试' : entry.mode === 'review' ? '错题重练' : '顺序练习'}
                </span>
                <span className="record-score mono">{entry.accuracy}%</span>
                <span className="record-detail">
                  对 {entry.correct} · 错 {entry.wrong} · 跳过 {entry.skipped}
                </span>
                <span className="record-date">
                  {new Date(entry.finishedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Link to="/catalog" className="back-link">
        <ArrowLeft /> 返回题库总览
      </Link>
    </div>
  )
}
