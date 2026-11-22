import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { formatDuration, percent } from '../lib/quiz'
import { EmptyState } from '../components/ui/primitives'
import { ArrowRight, Clock, ListChecks, Target, Trash2, Trophy } from '../components/ui/icons'

export function HistoryPage() {
  const history = useAppStore((state) => state.history)
  const clearHistory = useAppStore((state) => state.clearHistory)

  if (history.length === 0) {
    return (
      <div className="history-page">
        <header className="page-head">
          <span className="eyebrow">练习记录</span>
          <h1 className="page-title serif">每次练习都会留痕</h1>
        </header>
        <EmptyState
          icon={<ListChecks />}
          title="还没有练习记录"
          description="完成一组练习或模拟考试后，成绩、用时和错题数会记录在这里。"
          action={
            <Link to="/catalog" className="button button-primary button-sm">
              去练习 <ArrowRight />
            </Link>
          }
        />
      </div>
    )
  }

  const best = history.reduce((top, entry) => Math.max(top, entry.accuracy), 0)
  const average = percent(
    history.reduce((sum, entry) => sum + entry.accuracy, 0),
    history.length * 100,
  )

  return (
    <div className="history-page">
      <header className="page-head page-head-row">
        <div>
          <span className="eyebrow">练习记录</span>
          <h1 className="page-title serif">{history.length} 次练习，最高 {best}%</h1>
          <p className="page-sub">平均正确率 {average}%，记录保留在本机，最多 100 条。</p>
        </div>
        <button
          className="button button-ghost button-sm"
          onClick={() => {
            if (window.confirm('清空练习记录与每日统计？错题与收藏不受影响。')) clearHistory()
          }}
        >
          <Trash2 /> 清空记录
        </button>
      </header>

      <div className="history-list">
        {history.map((entry) => (
          <Link
            to={`/collection/${entry.collectionId}`}
            className="history-row"
            key={entry.id}
          >
            <span className={`history-mode mode-${entry.mode}`}>
              {entry.mode === 'exam' ? '模拟考试' : entry.mode === 'review' ? '错题重练' : '顺序练习'}
            </span>
            <span className="history-title">
              <strong>{entry.collectionTitle}</strong>
              <span>
                {new Date(entry.finishedAt).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </span>
            <span className="history-numbers">
              <span>
                <Target /> {entry.correct} / {entry.total}
              </span>
              <span>
                <Clock /> {formatDuration(entry.durationSec)}
              </span>
              <span>
                <Trophy /> {entry.accuracy}%
              </span>
            </span>
            <ArrowRight className="history-arrow" />
          </Link>
        ))}
      </div>
    </div>
  )
}
