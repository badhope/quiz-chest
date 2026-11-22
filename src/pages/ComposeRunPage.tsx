import { useLocation, useNavigate } from 'react-router-dom'
import type { Question } from '../data/types'
import { PracticeRunner } from '../components/question/PracticeRunner'
import { EmptyState } from '../components/ui/primitives'
import { Layers } from '../components/ui/icons'

interface ComposeRunState {
  questions: Question[]
  title: string
  timeLimitMin: number
  bankIds: string[]
}

export function ComposeRunPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as ComposeRunState | null

  if (!state || !Array.isArray(state.questions) || state.questions.length === 0) {
    return (
      <div className="compose-page">
        <EmptyState
          icon={<Layers />}
          title="没有可作的试卷"
          description="请回到组卷页重新生成。"
          action={
            <button className="button button-primary button-sm" onClick={() => navigate('/compose')}>
              返回组卷
            </button>
          }
        />
      </div>
    )
  }

  const isExam = state.timeLimitMin > 0

  return (
    <PracticeRunner
      questions={state.questions}
      title={state.title}
      subtitle="自定义组卷"
      mode={isExam ? 'exam' : 'practice'}
      timeLimitSec={isExam ? state.timeLimitMin * 60 : undefined}
      historyCollectionId="compose:custom"
      historyTitle={state.title}
      backTo="/compose"
      emptyHint="这份试卷没有题目，返回组卷页重新生成。"
    />
  )
}
