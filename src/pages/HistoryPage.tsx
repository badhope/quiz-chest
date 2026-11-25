import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { formatDateTime } from '../lib/datetime'
import { formatDuration, percent, sessionModeLabel } from '../lib/quiz'
import { AsyncButton } from '../components/ui/AsyncButton'
import { EmptyState } from '../components/ui/primitives'
import { PageHeader } from '../components/ui/sections'
import { ArrowRight, Clock, ListChecks, Target, Trash2, Trophy } from '../components/ui/icons'

export function HistoryPage() {
  const history = useAppStore((state) => state.history)
  const clearHistory = useAppStore((state) => state.clearHistory)

  if (history.length === 0) {
    return (
      <div className="history-page">
        <PageHeader eyebrow="练习记录" title="每次练习都会留痕" />
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
      <PageHeader
        eyebrow="练习记录"
        title={`${history.length} 次练习，最高 ${best}%`}
        subtitle={`平均正确率 ${average}%，记录保留在本机，最多 100 条。`}
        actions={
          <AsyncButton
            confirmText="清空练习记录与每日统计？错题与收藏不受影响。"
            busyLabel="清空中…"
            action={() => clearHistory()}
          >
            <Trash2 /> 清空记录
          </AsyncButton>
        }
      />

      <div className="history-list">
        {history.map((entry) => (
          <Link
            to={`/collection/${entry.collectionId}`}
            className="history-row"
            key={entry.id}
          >
            <span className={`history-mode mode-${entry.mode}`}>
              {sessionModeLabel(entry.mode)}
            </span>
            <span className="history-title">
              <strong>{entry.collectionTitle}</strong>
              <span>
                {formatDateTime(entry.finishedAt)}
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
                <Trophy /> {entry.exam ? `${entry.exam.score}/${entry.exam.fullScore} 分` : `${entry.accuracy}%`}
              </span>
            </span>
            <ArrowRight className="history-arrow" />
          </Link>
        ))}
      </div>
    </div>
  )
}
