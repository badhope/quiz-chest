import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { buildPlan, strategyCatalog, type StrategyKind } from '../lib/strategy'
import { getCollection } from '../data'
import { Badge, EmptyState, ProgressBar } from '../components/ui/primitives'
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  Clock,
  Flame,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from '../components/ui/icons'
import { DomainIcon } from '../components/ui/icons'

export function StrategyPage() {
  const { kind = 'daily' } = useParams()
  const history = useAppStore((state) => state.history)
  const wrongBook = useAppStore((state) => state.wrongBook)

  const validKind = strategyCatalog.some((item) => item.kind === kind)
    ? (kind as StrategyKind)
    : 'daily'

  const plan = useMemo(
    () => buildPlan(validKind, { history, wrongBook }),
    [validKind, history, wrongBook],
  )

  const meta = strategyCatalog.find((item) => item.kind === validKind)!

  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const question of plan.questions) {
      map.set(question.collectionId, (map.get(question.collectionId) ?? 0) + 1)
    }
    return [...map.entries()].map(([collectionId, count]) => ({
      collection: getCollection(collectionId),
      count,
    }))
  }, [plan.questions])

  const empty = plan.questions.length === 0

  return (
    <div className="strategy-page">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/">学习台</Link>
        <ArrowRight />
        <span>练习策略</span>
      </nav>

      <header className={`strategy-hero tone-${meta.tone}`}>
        <span className="strategy-mark">
          {validKind === 'daily' ? <Sparkles /> : null}
          {validKind === 'weak' ? <Target /> : null}
          {validKind === 'random' ? <Zap /> : null}
          {validKind === 'wrong' ? <RotateCcw /> : null}
        </span>
        <div className="strategy-hero-text">
          <span className="eyebrow">练习策略 · {meta.subtitle}</span>
          <h1 className="page-title serif">{meta.title}</h1>
          <p className="page-sub">{meta.description}</p>
        </div>
      </header>

      <section className="strategy-explainer">
        <div>
          <span className="eyebrow">本次配题依据</span>
          <p>{plan.reason}</p>
        </div>
        <div className="strategy-numbers">
          <div>
            <strong className="mono">{plan.questions.length}</strong>
            <span>题</span>
          </div>
          <div>
            <strong className="mono">{grouped.length}</strong>
            <span>个题库</span>
          </div>
          <div>
            <strong className="mono">
              {plan.questions.reduce((sum, item) => sum + item.difficulty, 0) /
                Math.max(1, plan.questions.length) >= 2
                ? '中高'
                : '基础'}
            </strong>
            <span>难度</span>
          </div>
        </div>
      </section>

      {empty ? (
        <EmptyState
          icon={<Trophy />}
          title={validKind === 'wrong' ? '错题本还是空的' : '暂时无法生成'}
          description={
            validKind === 'wrong'
              ? '先去任意题库练一组，答错的题会自动进入错题本。'
              : '完成一次练习后，系统会根据正确率重新生成计划。'
          }
          action={
            <Link to="/catalog" className="button button-primary button-sm">
              去题库练习
            </Link>
          }
        />
      ) : (
        <>
          <section className="strategy-composition">
            <div className="section-head">
              <div>
                <span className="eyebrow">配题构成</span>
                <h2 className="section-title serif">这次会练到哪些题库</h2>
              </div>
            </div>
            <div className="strategy-composition-list">
              {grouped.map(({ collection, count }) => {
                if (!collection) return null
                return (
                  <Link
                    key={collection.id}
                    to={`/collection/${collection.id}`}
                    className="strategy-composition-row"
                  >
                    <span className="strategy-composition-icon">
                      <DomainIcon name={collection.icon} />
                    </span>
                    <span className="strategy-composition-text">
                      <strong>{collection.title}</strong>
                      <small>{collection.exam}</small>
                    </span>
                    <Badge tone="neutral">{count} 题</Badge>
                    <ProgressBar
                      value={(count / plan.questions.length) * 100}
                      tone="moss"
                      label={`${collection.title} 占比`}
                    />
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="strategy-start">
            <div>
              <span className="eyebrow">准备好了</span>
              <h2 className="serif">
                {validKind === 'random' ? '随机组卷' : plan.title} · {plan.questions.length} 题
              </h2>
              <p>
                {validKind === 'daily'
                  ? '每天一组，按正确率动态调整配比，建议 10-15 分钟内完成。'
                  : validKind === 'wrong'
                    ? '答对即移出错题本，答错会累计错误次数。'
                    : '交卷后生成成绩单，错题自动收录。'}
              </p>
            </div>
            <div className="strategy-start-actions">
              <Link to={`/practice-plan/${validKind}?mode=practice`} className="button button-primary">
                {meta.action}
                <ArrowRight />
              </Link>
              <Link to={`/practice-plan/${validKind}?mode=exam`} className="button button-ghost">
                <Clock /> 计时考试
              </Link>
            </div>
          </section>
        </>
      )}

      <section className="strategy-others">
        <div className="section-head">
          <div>
            <span className="eyebrow">其他策略</span>
            <h2 className="section-title serif">换一种练法</h2>
          </div>
        </div>
        <div className="strategy-mini-grid">
          {strategyCatalog
            .filter((item) => item.kind !== validKind)
            .map((item) => (
              <Link key={item.kind} to={`/strategy/${item.kind}`} className="strategy-mini">
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
                <ArrowRight />
              </Link>
            ))}
        </div>
      </section>

      <div className="strategy-tip">
        <CircleHelp />
        <p>
          策略会在每次进入时重新计算，因此同一策略在不同日期抽到的题不同。若想固定题单，请从题库详情进入顺序练习。
        </p>
      </div>

      <Link to="/" className="back-link">
        <ArrowLeft /> 返回学习台
      </Link>

      <div className="strategy-footnote">
        <Flame /> 当前错题 {Object.keys(wrongBook).length} 道 · 历史练习 {history.length} 次
      </div>
    </div>
  )
}
