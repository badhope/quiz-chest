import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { domains } from '../data/taxonomy'
import { useAppStore, type ImportedBank } from '../store/useAppStore'
import { useLibraryCollections, type LibraryCollection } from '../lib/library'
import { downloadBankPackage } from '../lib/exporter'
import { ShareBankDialog } from '../components/share/ShareBankDialog'
import { AsyncButton } from '../components/ui/AsyncButton'
import { Badge, EmptyState, ProgressBar } from '../components/ui/primitives'
import { MissingPage } from '../components/ui/MissingPage'
import { DomainIcon } from '../components/ui/icons'
import { SectionHeader } from '../components/ui/sections'
import { formatDate } from '../lib/datetime'
import { summarizeHistory } from '../lib/stats'
import { sessionModeLabel } from '../lib/quiz'
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Download,
  PenLine,
  RotateCcw,
  Share2,
  Trash2,
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
  const banks = useAppStore((state) => state.banks)
  const removeBank = useAppStore((state) => state.removeBank)
  const [shareBank, setShareBank] = useState<ImportedBank | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  const records = useMemo(
    () => history.filter((entry) => entry.collectionId === collectionId),
    [history, collectionId],
  )

  if (!collection) {
    return (
      <MissingPage
        icon={<Layers />}
        title="题库不存在"
        description="该题库可能已被调整，请返回题库总览重新选择。"
        to="/catalog"
        linkLabel="返回题库总览"
      />
    )
  }

  const domain = domains.find((item) => item.id === collection.domainId) ?? (collection.origin === 'imported'
    ? { name: '我的题库', accent: collection.accent }
    : undefined)
  const wrongCount = collection.questions.filter((question) => wrongBook[question.id]).length
  const favoriteCount = collection.questions.filter((question) => favorites.includes(question.id)).length
  const { bestAccuracy, answeredCount } = summarizeHistory(records)
  const lastRecord = records[0]
  const mastery = records.length ? Math.round((bestAccuracy + Math.min(100, records.length * 12)) / 2) : 0

  const typeCount = {
    single: collection.questions.filter((q) => q.type === 'single').length,
    multiple: collection.questions.filter((q) => q.type === 'multiple').length,
    judge: collection.questions.filter((q) => q.type === 'judge').length,
  }

  return (
    <>
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
                  内置题库 · 入门可用
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
              单选、多选、判断共 {collection.questions.length} 题。可以先做一半，退出后进度会保留；
              提交后立即查看解析，错题自动进入错题本。
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
              to={`/study/${collection.id}`}
              className="button button-ghost"
            >
              <BookOpen />
              背题模式
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
              <>
                <Link to={`/edit/${collection.id}`} className="button button-ghost">
                  <PenLine />
                  编辑题库
                </Link>
                <button
                  className="button button-ghost"
                  onClick={() => {
                    const bank = banks.find((item) => item.id === collection.id)
                    if (bank) setShareBank(bank)
                  }}
                >
                  <Share2 /> 分享题库
                </button>
                <button
                  className="button button-ghost"
                  disabled={exporting}
                  onClick={async () => {
                    const bank = banks.find((item) => item.id === collection.id)
                    if (!bank) return
                    setExporting(true)
                    setExportMessage('')
                    const result = await downloadBankPackage(bank)
                    setExportMessage(
                      result.ok
                        ? result.channel === 'native-share'
                          ? '已生成题库包，请在系统面板中选择保存位置或发送方式。'
                          : '题库包已开始下载。'
                        : `导出失败：${result.error}。可重试。`,
                    )
                    setExporting(false)
                  }}
                >
                  <Download /> {exporting ? '导出中…' : '导出备份'}
                </button>
                <AsyncButton
                  className="button button-ghost library-delete"
                  confirmText={`删除「${collection.title}」？该题库与其练习记录关联将失效。`}
                  busyLabel="删除中…"
                  action={() => removeBank(collection.id)}
                >
                  <Trash2 /> 删除题库
                </AsyncButton>
              </>
            ) : null}
            {exportMessage ? (
              <p className="collection-export-note" role="status">
                {exportMessage}
              </p>
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
        <SectionHeader eyebrow="题目构成" title="先了解这份题库" />
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
        <SectionHeader eyebrow="考点标签" title="这份题库覆盖什么" />
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
        <SectionHeader
          eyebrow="我的记录"
          title="最近练习"
          aside={
            <Link to="/records?tab=history" className="section-link">
              全部记录 <ChevronRight />
            </Link>
          }
        />
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
                  {sessionModeLabel(entry.mode)}
                </span>
                <span className="record-score mono">{entry.accuracy}%</span>
                <span className="record-detail">
                  对 {entry.correct} · 错 {entry.wrong} · 跳过 {entry.skipped}
                </span>
                <span className="record-date">
                  {formatDate(entry.finishedAt)}
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
    {shareBank ? <ShareBankDialog bank={shareBank} onClose={() => setShareBank(null)} /> : null}
    </>
  )
}
