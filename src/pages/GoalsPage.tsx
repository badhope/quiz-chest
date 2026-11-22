import { Link, useParams } from 'react-router-dom'
import { goals, getGoal } from '../data/goals'
import { getCollection } from '../data'
import { useAppStore } from '../store/useAppStore'
import { Badge, EmptyState, ProgressBar } from '../components/ui/primitives'
import { DomainIcon } from '../components/ui/icons'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  Sparkles,
  Target,
  Trophy,
} from '../components/ui/icons'

export function GoalsPage() {
  return (
    <div className="goals-page">
      <header className="page-head">
        <span className="eyebrow">目标方案</span>
        <h1 className="page-title serif">先定目标，再谈刷多少题</h1>
        <p className="page-sub">
          把 {goals.length} 条备考路径拆成有序的题库步骤，按周推进，不必自己排计划。
        </p>
      </header>

      <div className="goal-grid">
        {goals.map((goal) => (
          <Link
            key={goal.id}
            to={`/goal/${goal.id}`}
            className="goal-card"
            style={{ '--goal-accent': goal.accent } as React.CSSProperties}
          >
            <div className="goal-card-head">
              <span className="goal-card-icon">
                <DomainIcon name={goal.icon} />
              </span>
              <Badge tone="neutral">{goal.intensity}</Badge>
            </div>
            <h2 className="serif">{goal.title}</h2>
            <p className="goal-card-audience">{goal.audience}</p>
            <p className="goal-card-outcome">{goal.outcome}</p>
            <div className="goal-card-steps">
              {goal.steps.slice(0, 4).map((step, index) => {
                const collection = getCollection(step.collectionId)
                return (
                  <span key={step.collectionId} className="goal-step-dot">
                    <i className="mono">{String(index + 1).padStart(2, '0')}</i>
                    {collection?.title ?? step.collectionId}
                  </span>
                )
              })}
            </div>
            <div className="goal-card-foot">
              <span>
                <Clock /> {goal.durationWeeks} 周
              </span>
              <span>
                <Target /> {goal.steps.length} 步
              </span>
              <ChevronRight />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function GoalPage() {
  const { goalId = '' } = useParams()
  const goal = getGoal(goalId)
  const history = useAppStore((state) => state.history)

  if (!goal) {
    return (
      <EmptyState
        icon={<Target />}
        title="目标方案不存在"
        description="该路线可能已被调整，请返回目标列表重新选择。"
        action={
          <Link to="/goals" className="button button-primary button-sm">
            返回目标方案
          </Link>
        }
      />
    )
  }

  const steps = goal.steps.map((step) => ({
    ...step,
    collection: getCollection(step.collectionId),
  }))
  const totalQuestions = steps.reduce(
    (sum, step) => sum + (step.collection?.questions.length ?? 0),
    0,
  )
  const touched = steps.filter((step) =>
    history.some((entry) => entry.collectionId === step.collectionId),
  ).length
  const progress = steps.length === 0 ? 0 : Math.round((touched / steps.length) * 100)

  return (
    <div
      className="goal-page"
      style={{ '--goal-accent': goal.accent } as React.CSSProperties}
    >
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/goals">目标方案</Link>
        <ChevronRight />
        <span>{goal.title}</span>
      </nav>

      <header className="goal-hero">
        <span className="goal-hero-icon">
          <DomainIcon name={goal.icon} />
        </span>
        <div className="goal-hero-text">
          <span className="eyebrow">
            {goal.audience} · {goal.intensity}
          </span>
          <h1 className="page-title serif">{goal.title}</h1>
          <p className="page-sub">{goal.outcome}</p>
          <div className="goal-hero-meta">
            <span>
              <Clock /> {goal.durationWeeks} 周
            </span>
            <span>
              <Target /> {steps.length} 个阶段
            </span>
            <span>
              <Sparkles /> {totalQuestions} 题
            </span>
          </div>
        </div>
      </header>

      <section className="goal-progress">
        <div>
          <span className="eyebrow">路线进度</span>
          <strong className="mono">{progress}%</strong>
        </div>
        <ProgressBar value={progress} tone="moss" label="目标路线进度" />
        <p>
          已开始 {touched} / {steps.length} 个阶段，完成所有阶段后这条路线即视为走完。
        </p>
      </section>

      <ol className="goal-timeline">
        {steps.map((step, index) => {
          const done = history.some((entry) => entry.collectionId === step.collectionId)
          return (
            <li key={step.collectionId} className={`goal-timeline-item${done ? ' done' : ''}`}>
              <span className="goal-timeline-marker mono">{String(index + 1).padStart(2, '0')}</span>
              <div className="goal-timeline-body">
                <span className="goal-timeline-phase">{step.phase}</span>
                <Link
                  to={step.collection ? `/collection/${step.collection.id}` : '/catalog'}
                  className="goal-timeline-title"
                >
                  {step.collection?.title ?? step.collectionId}
                  <ArrowRight />
                </Link>
                <p>{step.note}</p>
                {step.collection ? (
                  <div className="goal-timeline-tags">
                    <Badge tone={done ? 'success' : 'neutral'}>
                      {done ? '已开始' : '未开始'}
                    </Badge>
                    <span>{step.collection.exam}</span>
                    <span>{step.collection.questions.length} 题</span>
                  </div>
                ) : null}
              </div>
              {step.collection ? (
                <Link
                  to={`/practice/${step.collection.id}?mode=practice`}
                  className="goal-timeline-action"
                >
                  去练这一阶段
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>

      <section className="goal-tip">
        <Trophy />
        <p>
          路线只是顺序建议，不必严格按周执行。每完成一个阶段，回到「学习统计」查看该领域的正确率变化。
        </p>
      </section>

      <Link to="/goals" className="back-link">
        <ArrowLeft /> 返回目标方案
      </Link>
    </div>
  )
}
