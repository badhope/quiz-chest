import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { HistoryPage } from './HistoryPage'

const StatsPage = lazy(() =>
  import('./StatsPage').then((module) => ({ default: module.StatsPage })),
)

/**
 * 学习档案：统计与练习记录是同一条时间线的两种读法。
 *
 * 图表回答「趋势怎么样」，列表回答「那次具体考了多少」；分成两个侧栏项，
 * 用户查一次成绩要跳两次页。合并后用标签切换，图表仍然懒加载，
 * 不看统计的人不会下载 ECharts。
 */
export function RecordsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'stats'

  return (
    <div className="records-page">
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next, { replace: true })
        }}
      >
        <Tabs.List className="shelf-tabs" aria-label="学习档案视图">
          <Tabs.Trigger value="stats">学习统计</Tabs.Trigger>
          <Tabs.Trigger value="history">练习记录</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="stats" className="shelf-panel">
          <Suspense fallback={<div className="route-loading">正在加载统计图表…</div>}>
            <StatsPage />
          </Suspense>
        </Tabs.Content>
        <Tabs.Content value="history" className="shelf-panel">
          <HistoryPage />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
