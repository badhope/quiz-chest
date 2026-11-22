import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { lastNDays, percent, streakFromDates } from '../lib/quiz'
import { getLibraryCollections } from '../lib/library'
import { domains } from '../data/taxonomy'
import { EChart } from '../components/charts/EChart'
import { EmptyState, ProgressBar, Stat } from '../components/ui/primitives'
import { BarChart3, Clock, Flame, Target, TrendingUp, Trophy } from '../components/ui/icons'
import type { EChartsCoreOption } from 'echarts/core'

const palette = {
  light: {
    ink: '#1d2523',
    muted: '#76807a',
    line: '#ddd5c5',
    accent: '#a8442a',
    moss: '#3d5a45',
    gold: '#9b7420',
  },
  dark: {
    ink: '#ece7db',
    muted: '#8a968f',
    line: '#2b3430',
    accent: '#e08564',
    moss: '#8bb79c',
    gold: '#d6b266',
  },
}

export function StatsPage() {
  const history = useAppStore((state) => state.history)
  const daily = useAppStore((state) => state.daily)
  const wrongBook = useAppStore((state) => state.wrongBook)
  const favorites = useAppStore((state) => state.favorites)
  const theme = useAppStore((state) => state.settings.theme)
  const colors = palette[theme]

  const days = lastNDays(7)
  const dailySeries = days.map((day) => daily[day] ?? { date: day, answered: 0, correct: 0 })
  const totalAnswered = Object.values(daily).reduce((sum, item) => sum + item.answered, 0)
  const totalCorrect = Object.values(daily).reduce((sum, item) => sum + item.correct, 0)
  const accuracy = percent(totalCorrect, totalAnswered)
  const streak = streakFromDates(Object.keys(daily))
  const totalMinutes = Math.round(
    history.reduce((sum, entry) => sum + entry.durationSec, 0) / 60,
  )

  const domainStats = useMemo(() => {
    const counts = new Map<string, number>()
    const accentOf = new Map<string, string>()
    for (const collection of getLibraryCollections()) {
      accentOf.set(collection.domainId, collection.accent)
    }
    for (const entry of history) {
      const collection = getLibraryCollections().find((item) => item.id === entry.collectionId)
      if (!collection) continue
      counts.set(collection.domainId, (counts.get(collection.domainId) ?? 0) + entry.answered)
    }
    const importedCount = counts.get('imported') ?? 0
    const rows = domains
      .map((domain) => ({
        name: domain.name,
        value: counts.get(domain.id) ?? 0,
        color: domain.accent,
      }))
      .filter((item) => item.value > 0)
    if (importedCount > 0) {
      rows.unshift({ name: '我的题库', value: importedCount, color: accentOf.get('imported') ?? '#7A5C2E' })
    }
    return rows
  }, [history])

  const accuracySeries = useMemo(() => {
    return [...history]
      .slice(0, 10)
      .reverse()
      .map((entry, index) => ({
        label: `${index + 1}`,
        value: entry.accuracy,
      }))
  }, [history])

  const barOption = useMemo<EChartsCoreOption>(
    () => ({
      grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme === 'dark' ? '#1a201e' : '#fbf9f3',
        borderColor: colors.line,
        textStyle: { color: colors.ink, fontSize: 12 },
        axisPointer: { type: 'shadow' },
      },
      xAxis: {
        type: 'category',
        data: dailySeries.map((item) => item.date.slice(5).replace('-', '/')),
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        axisLabel: { color: colors.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.line, type: 'dashed' } },
        axisLabel: { color: colors.muted, fontSize: 11 },
      },
      series: [
        {
          name: '作答',
          type: 'bar',
          data: dailySeries.map((item) => item.answered),
          barWidth: '46%',
          itemStyle: { color: colors.accent, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '答对',
          type: 'bar',
          data: dailySeries.map((item) => item.correct),
          barWidth: '46%',
          itemStyle: { color: colors.moss, borderRadius: [3, 3, 0, 0] },
        },
      ],
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: colors.muted, fontSize: 11 },
      },
    }),
    [dailySeries, colors, theme],
  )

  const pieOption = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: theme === 'dark' ? '#1a201e' : '#fbf9f3',
        borderColor: colors.line,
        textStyle: { color: colors.ink, fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '82%'],
          center: ['50%', '52%'],
          itemStyle: { borderColor: theme === 'dark' ? '#121615' : '#fbf9f3', borderWidth: 2 },
          label: { show: false },
          data: domainStats.map((item) => ({
            name: item.name,
            value: item.value,
            itemStyle: { color: item.color },
          })),
        },
      ],
    }),
    [domainStats, colors, theme],
  )

  const lineOption = useMemo<EChartsCoreOption>(
    () => ({
      grid: { left: 8, right: 12, top: 18, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme === 'dark' ? '#1a201e' : '#fbf9f3',
        borderColor: colors.line,
        textStyle: { color: colors.ink, fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: accuracySeries.map((item) => item.label),
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        axisLabel: { color: colors.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: colors.line, type: 'dashed' } },
        axisLabel: { color: colors.muted, fontSize: 11, formatter: '{value}%' },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: accuracySeries.map((item) => item.value),
          lineStyle: { color: colors.gold, width: 2 },
          itemStyle: { color: colors.gold },
          areaStyle: { color: colors.gold, opacity: 0.12 },
        },
      ],
    }),
    [accuracySeries, colors, theme],
  )

  if (history.length === 0) {
    return (
      <div className="stats-page">
        <header className="page-head">
          <span className="eyebrow">学习统计</span>
          <h1 className="page-title serif">数据会记录每一次进步</h1>
          <p className="page-sub">完成练习或模拟考试后，这里会生成作答趋势、领域分布与正确率曲线。</p>
        </header>
        <EmptyState
          icon={<BarChart3 />}
          title="还没有可统计的数据"
          description="先完成一组练习，统计页会自动生成图表。"
          action={
            <Link to="/catalog" className="button button-primary button-sm">
              去练习
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="stats-page">
      <header className="page-head">
        <span className="eyebrow">学习统计</span>
        <h1 className="page-title serif">你的学习曲线</h1>
        <p className="page-sub">共 {history.length} 次练习记录，数据保存在本机，不上传。</p>
      </header>

      <section className="stat-strip">
        <Stat label="累计作答" value={totalAnswered} hint="全部练习" icon={<BarChart3 />} />
        <Stat label="平均正确率" value={`${accuracy}%`} hint={`答对 ${totalCorrect} 题`} icon={<TrendingUp />} />
        <Stat label="累计时长" value={`${totalMinutes} 分钟`} hint="练习与考试" icon={<Clock />} />
        <Stat label="连续练习" value={`${streak} 天`} hint="按自然日计算" icon={<Flame />} />
      </section>

      <div className="stats-grid">
        <section className="chart-card wide">
          <header>
            <h2 className="serif">近 7 天作答</h2>
            <span>每日作答与答对数量</span>
          </header>
          <EChart option={barOption} height={260} ariaLabel="近七天作答数量柱状图" />
        </section>
        <section className="chart-card">
          <header>
            <h2 className="serif">领域分布</h2>
            <span>按累计作答量</span>
          </header>
          {domainStats.length > 0 ? (
            <>
              <EChart option={pieOption} height={220} ariaLabel="领域作答分布环形图" />
              <ul className="legend-list">
                {domainStats.map((item) => (
                  <li key={item.name}>
                    <i style={{ background: item.color }} />
                    {item.name}
                    <span className="mono">{item.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="chart-empty">暂无领域数据</p>
          )}
        </section>
        <section className="chart-card wide">
          <header>
            <h2 className="serif">正确率走势</h2>
            <span>最近 10 次练习</span>
          </header>
          <EChart option={lineOption} height={220} ariaLabel="最近十次练习正确率折线图" />
        </section>
        <section className="chart-card">
          <header>
            <h2 className="serif">复习清单</h2>
            <span>待处理内容</span>
          </header>
          <div className="stats-facts">
            <div>
              <Target />
              <strong className="mono">{Object.keys(wrongBook).length}</strong>
              <span>错题待复习</span>
            </div>
            <div>
              <Trophy />
              <strong className="mono">{favorites.length}</strong>
              <span>收藏题目</span>
            </div>
            <div>
              <Clock />
              <strong className="mono">{history.length}</strong>
              <span>练习次数</span>
            </div>
          </div>
          <Link to="/wrong" className="button button-ghost button-sm stats-link">
            打开错题本
          </Link>
        </section>
      </div>

      <section className="chart-card goal-card">
        <header>
          <h2 className="serif">今日目标</h2>
          <span>目标 20 题</span>
        </header>
        <ProgressBar value={Math.min(100, ((daily[lastNDays(1)[0]]?.answered ?? 0) / 20) * 100)} />
        <p className="goal-copy">
          今日已作答 {daily[lastNDays(1)[0]]?.answered ?? 0} 题，
          {daily[lastNDays(1)[0]]?.answered >= 20 ? '目标已完成。' : '继续保持。'}
        </p>
      </section>
    </div>
  )
}
