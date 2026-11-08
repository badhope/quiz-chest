import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, type PaperRecord } from '../store/useAppStore'
import {
  availableQuestionCount,
  buildCustomPaper,
  clampCount,
  clampDuration,
  COUNT_MAX,
  COUNT_MIN,
  COUNT_PRESETS,
  DURATION_MAX,
  DURATION_MIN,
  DURATION_PRESETS,
} from '../lib/customPaper'
import type { CustomPaperSpec } from '../lib/customPaper'
import { formatRelativeTime } from '../lib/quiz'
import { EmptyState } from '../components/ui/primitives'
import { DomainIcon } from '../components/ui/icons'
import { ArrowRight, BookOpen, CircleCheck, CircleX, Layers, Printer, RotateCcw, Trash2, Trophy } from '../components/ui/icons'

export function ComposePage() {
  const navigate = useNavigate()
  const banks = useAppStore((state) => state.banks)
  const papers = useAppStore((state) => state.papers)
  const addPaper = useAppStore((state) => state.addPaper)
  const removePaper = useAppStore((state) => state.removePaper)
  const [selected, setSelected] = useState<string[]>([])
  const [count, setCount] = useState<number>(20)
  const [durationMin, setDurationMin] = useState<number>(30)
  const [order, setOrder] = useState<'random' | 'sequence'>('random')

  const available = useMemo(() => availableQuestionCount(selected), [selected])
  const effectiveCount = Math.min(count, available)
  const noBanks = banks.length === 0

  const toggleBank = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const start = (mode: 'practice' | 'exam') => {
    const spec: CustomPaperSpec = { collectionIds: selected, count: effectiveCount, durationMin, order }
    const paper = buildCustomPaper(spec)
    if (paper.questions.length === 0) return
    const now = Date.now()
    addPaper({
      id: `paper_${now}`,
      title: paper.title,
      collectionIds: selected,
      count: paper.questions.length,
      durationMin,
      order,
      createdAt: now,
    })
    navigate('/compose-run', {
      state: {
        questions: paper.questions,
        title: paper.title,
        timeLimitMin: mode === 'exam' ? durationMin : 0,
        bankIds: selected,
      },
    })
  }

  /**
   * 打印不写组卷历史：历史记录用于「重开上次的卷」，而打印是一次性动作，
   * 混进去会让历史列表被大量重复条目挤占。
   */
  const print = () => {
    const spec: CustomPaperSpec = { collectionIds: selected, count: effectiveCount, durationMin, order }
    const paper = buildCustomPaper(spec)
    if (paper.questions.length === 0) return
    navigate('/print', {
      state: { questions: paper.questions, title: paper.title, durationMin },
    })
  }

  const reopen = (record: PaperRecord) => {
    setSelected(record.collectionIds.filter((id) => banks.some((bank) => bank.id === id)))
    setCount(record.count)
    setDurationMin(record.durationMin)
    setOrder(record.order)
  }

  if (noBanks) {
    return (
      <div className="compose-page">
        <header className="page-head">
          <span className="eyebrow">自定义组卷</span>
          <h1 className="page-title serif">从自己的题库里抽一组</h1>
        </header>
        <EmptyState
          icon={<Layers />}
          title="还没有可用的题库"
          description="先导入一个题库，再回来组卷。导入的题库会出现在下面的列表里。"
          action={
            <a href="/import" className="button button-primary button-sm">
              去导入 <ArrowRight />
            </a>
          }
        />
      </div>
    )
  }

  return (
    <div className="compose-page">
      <header className="page-head">
        <span className="eyebrow">自定义组卷</span>
        <h1 className="page-title serif">从自己的题库里抽一组</h1>
        <p className="page-sub">选题库、定题量与时长，生成一次专属练习或模拟考试。</p>
      </header>

      <section className="compose-section">
        <div className="section-head">
          <h2 className="section-title serif">第一步 · 选题库</h2>
          <span>{selected.length > 0 ? `已选 ${selected.length} 个 · 共 ${available} 题` : '至少选一个'}</span>
        </div>
        <div className="compose-banks">
          {banks.map((bank) => {
            const active = selected.includes(bank.id)
            return (
              <button
                key={bank.id}
                className={`compose-bank${active ? ' active' : ''}`}
                onClick={() => toggleBank(bank.id)}
                aria-pressed={active}
              >
                <span className="compose-bank-icon" style={{ background: bank.accent }}>
                  <DomainIcon name={(bank.icon as 'book') ?? 'book'} />
                </span>
                <span className="compose-bank-text">
                  <strong>{bank.title}</strong>
                  <small>{bank.questions.length} 题 · {bank.exam}</small>
                </span>
                {active ? <CircleCheck /> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="compose-section">
        <div className="section-head">
          <h2 className="section-title serif">第二步 · 定题量</h2>
          <span>1-{COUNT_MAX} 题{available > 0 ? ` · 当前可选 ${available} 题` : ''}</span>
        </div>
        <div className="compose-presets">
          {COUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`compose-chip${count === preset ? ' active' : ''}`}
              onClick={() => setCount(preset)}
              disabled={preset > available}
            >
              {preset} 题
            </button>
          ))}
          <input
            type="number"
            className="compose-number mono"
            min={COUNT_MIN}
            max={COUNT_MAX}
            value={count}
            onChange={(event) => setCount(clampCount(Number(event.target.value)))}
            aria-label="自定义题量"
          />
        </div>
      </section>

      <section className="compose-section">
        <div className="section-head">
          <h2 className="section-title serif">第三步 · 定时长与顺序</h2>
          <span>{DURATION_MIN}-{DURATION_MAX} 分钟</span>
        </div>
        <div className="compose-presets">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`compose-chip${durationMin === preset ? ' active' : ''}`}
              onClick={() => setDurationMin(preset)}
            >
              {preset} 分钟
            </button>
          ))}
          <input
            type="number"
            className="compose-number mono"
            min={DURATION_MIN}
            max={DURATION_MAX}
            value={durationMin}
            onChange={(event) => setDurationMin(clampDuration(Number(event.target.value)))}
            aria-label="自定义时长"
          />
        </div>
        <div className="compose-order">
          <button
            className={`compose-chip${order === 'random' ? ' active' : ''}`}
            onClick={() => setOrder('random')}
          >
            随机顺序
          </button>
          <button
            className={`compose-chip${order === 'sequence' ? ' active' : ''}`}
            onClick={() => setOrder('sequence')}
          >
            题库顺序
          </button>
        </div>
      </section>

      {available > 0 && count > available ? (
        <p className="compose-warn" role="status">
          <CircleX /> 所选题库共 {available} 题，将按全部 {available} 题组卷
        </p>
      ) : null}

      <section className="compose-actions">
        <button className="button button-ghost" disabled={selected.length === 0 || available === 0} onClick={() => start('practice')}>
          <BookOpen /> 开始练习
        </button>
        <button
          className="button button-primary"
          disabled={selected.length === 0 || available === 0}
          onClick={() => start('exam')}
        >
          <Trophy /> 模拟考试（{effectiveCount} 题 · {durationMin} 分钟）
        </button>
        <button
          className="button button-ghost"
          disabled={selected.length === 0 || available === 0}
          onClick={print}
        >
          <Printer /> 打印试卷
        </button>
      </section>

      {papers.length > 0 ? (
        <section className="compose-history">
          <div className="section-head">
            <h2 className="section-title serif">最近组卷</h2>
            <span>最多保留 20 条，点「重开」恢复同一配置</span>
          </div>
          <div className="compose-history-list">
            {papers.map((record) => (
              <div className="compose-history-row" key={record.id}>
                <span className="compose-history-main">
                  <strong>{record.title}</strong>
                  <small>
                    {record.count} 题 · {record.durationMin} 分钟 ·{' '}
                    {record.order === 'random' ? '随机顺序' : '题库顺序'} ·{' '}
                    {formatRelativeTime(record.createdAt)}
                  </small>
                </span>
                <button className="button button-ghost button-sm" onClick={() => reopen(record)}>
                  <RotateCcw /> 重开
                </button>
                <button
                  className="icon-button"
                  aria-label={`删除 ${record.title}`}
                  onClick={() => removePaper(record.id)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
