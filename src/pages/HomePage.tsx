import { Link } from 'react-router-dom'
import { collections, domains } from '../data/taxonomy'
import { totalQuestions, getCollection } from '../data'
import { goals } from '../data/goals'
import { useAppStore } from '../store/useAppStore'
import { dateKey, percent, streakFromDates } from '../lib/quiz'
import { buildDailyPlan } from '../lib/strategy'
import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Library,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from '../components/ui/icons'
import { DomainIcon } from '../components/ui/icons'
import { Badge, ProgressBar } from '../components/ui/primitives'
import type { PendingSession } from '../data/records'

const TODAY_KEY = dateKey(Date.now())

/** 未完成会话回到哪一页：练习与错题重练走题库练习页，组卷走组卷运行页。 */
function resumePath(session: PendingSession): string {
  if (session.collectionId.startsWith('compose:')) return '/compose'
  return `/practice/${session.collectionId}?mode=${session.mode}`
}

const paths = [
  {
    id: 'goal',
    to: '/goals',
    kicker: '路径一',
    title: '我有明确目标',
    copy: '考研、面试、考证、出国 —— 按目标给你排好顺序。',
    detail: `${goals.length} 条备考路线`,
    icon: Target,
    tone: 'goal',
  },
  {
    id: 'browse',
    to: '/catalog',
    kicker: '路径二',
    title: '我想按领域找',
    copy: '先选大方向，再看学段与科目，一层层缩小范围。',
    detail: `${domains.length} 个领域 · ${collections.length} 个题库`,
    icon: Library,
    tone: 'browse',
  },
  {
    id: 'auto',
    to: '/strategy/daily',
    kicker: '路径三',
    title: '不知道练什么',
    copy: '交给系统：按薄弱领域加权，正确率越低分到的题越多。',
    detail: '4 种练习策略',
    icon: Sparkles,
    tone: 'auto',
  },
] as const

export function HomePage() {
  const history = useAppStore((state) => state.history)
  const daily = useAppStore((state) => state.daily)
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)
  const lastCollectionId = useAppStore((state) => state.lastCollectionId)
  const lastCollection = lastCollectionId ? getCollection(lastCollectionId) : undefined
  const pendingSession = useAppStore((state) => state.pendingSession)

  const streak = streakFromDates(Object.keys(daily))
  const totalAnswered = Object.values(daily).reduce((sum, item) => sum + item.answered, 0)
  const totalCorrect = Object.values(daily).reduce((sum, item) => sum + item.correct, 0)
  const accuracy = percent(totalCorrect, totalAnswered)
  const todayAnswered = daily[TODAY_KEY]?.answered ?? 0

  const plan = buildDailyPlan({ history })
  const coveredCollections = new Set(plan.questions.map((question) => question.collectionId))

  return (
    <div className="home">
      <section className="home-head">
        <div className="home-head-main">
          <span className="eyebrow">
            <Sparkles /> 今天想怎么练
          </span>
          <h1 className="home-title serif">
            不用先想清楚练什么，
            <br />
            先选一条<span className="accent-underline">找题的路</span>。
          </h1>
        </div>
        <div className="home-today">
          <div className="home-today-top">
            <span className="home-today-label">今日</span>
            <span className="home-today-streak">
              <Flame /> {streak > 0 ? `${streak} 天` : '未开始'}
            </span>
          </div>
          <div className="home-today-value">
            <strong className="mono">{String(todayAnswered).padStart(2, '0')}</strong>
            <span>/ 20 题</span>
          </div>
          <ProgressBar value={Math.min(100, (todayAnswered / 20) * 100)} label="今日刷题进度" />
          <p className="home-today-foot">
            {todayAnswered >= 20 ? '今日目标已完成' : `还差 ${20 - todayAnswered} 题`}
          </p>
        </div>
      </section>

      <section className="path-grid" aria-label="三条找题路径">
        {paths.map((path) => {
          const Icon = path.icon
          return (
            <Link key={path.id} to={path.to} className={`path-card path-${path.tone}`}>
              <span className="path-kicker">{path.kicker}</span>
              <span className="path-icon">
                <Icon />
              </span>
              <h2 className="serif">{path.title}</h2>
              <p>{path.copy}</p>
              <span className="path-foot">
                {path.detail}
                <ArrowRight />
              </span>
            </Link>
          )
        })}
      </section>

      <section className="home-continue">
        <div className="section-head">
          <div>
            <span className="eyebrow">接着上次</span>
            <h2 className="section-title serif">
              {lastCollection ? lastCollection.title : '还没有开始，先做一组'}
            </h2>
          </div>
          <Link to="/history" className="section-link">
            练习记录 <ChevronRight />
          </Link>
        </div>
        <div className="continue-row">
          {pendingSession ? (
            <Link
              to={resumePath(pendingSession)}
              className="continue-card continue-primary"
            >
              <span className="continue-icon">
                <Play />
              </span>
              <span className="continue-text">
                <strong>继续「{pendingSession.collectionTitle}」</strong>
                <small>
                  已完成 {Object.keys(pendingSession.answers).length} /{' '}
                  {pendingSession.questionIds.length} 题 · 中途退出也不会丢
                </small>
              </span>
              <Zap />
            </Link>
          ) : lastCollection ? (
            <Link
              to={`/practice/${lastCollection.id}?mode=practice`}
              className="continue-card continue-primary"
            >
              <span className="continue-icon">
                <DomainIcon name={lastCollection.icon} />
              </span>
              <span className="continue-text">
                <strong>继续「{lastCollection.title}」</strong>
                <small>
                  {lastCollection.exam} · 共{' '}
                  {lastCollection.questions.length} 题
                </small>
              </span>
              <Zap />
            </Link>
          ) : null}
          <Link to="/strategy/daily" className="continue-card">
            <span className="continue-icon muted">
              <Sparkles />
            </span>
            <span className="continue-text">
              <strong>今日一练</strong>
              <small>
                {plan.questions.length} 题 · 覆盖 {coveredCollections.size} 个题库
              </small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/wrong" className="continue-card">
            <span className="continue-icon muted">
              <Target />
            </span>
            <span className="continue-text">
              <strong>错题复习</strong>
              <small>{Object.keys(wrongBook).length} 道待复习</small>
            </span>
            <ArrowRight />
          </Link>
        </div>
      </section>

      <section className="home-insights">
        <div className="insight-strip">
          <div>
            <Layers />
            <span>累计作答</span>
            <strong className="mono">{totalAnswered}</strong>
          </div>
          <div>
            <TrendingUp />
            <span>平均正确率</span>
            <strong className="mono">{accuracy}%</strong>
          </div>
          <div>
            <Bookmark />
            <span>收藏</span>
            <strong className="mono">{favorites.length}</strong>
          </div>
          <div>
            <Trophy />
            <span>练习次数</span>
            <strong className="mono">{history.length}</strong>
          </div>
          <div>
            <Clock />
            <span>题库总量</span>
            <strong className="mono">{totalQuestions}</strong>
          </div>
        </div>
      </section>

      <section className="home-goals">
        <div className="section-head">
          <div>
            <span className="eyebrow">如果目标明确</span>
            <h2 className="section-title serif">直接进入一条备考路线</h2>
          </div>
          <Link to="/goals" className="section-link">
            全部 {goals.length} 条 <ChevronRight />
          </Link>
        </div>
        <div className="goal-rail">
          {goals.map((goal) => (
            <Link
              key={goal.id}
              to={`/goal/${goal.id}`}
              className="goal-chip"
              style={{ '--goal-accent': goal.accent } as React.CSSProperties}
            >
              <span className="goal-chip-icon">
                <DomainIcon name={goal.icon} />
              </span>
              <span className="goal-chip-text">
                <strong>{goal.title}</strong>
                <small>
                  {goal.durationWeeks} 周 · {goal.steps.length} 步
                </small>
              </span>
              <Badge tone="neutral">{goal.intensity}</Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
