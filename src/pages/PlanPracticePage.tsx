import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { buildPlan, strategyCatalog, type StrategyKind } from '../lib/strategy'
import { PracticeRunner } from '../components/question/PracticeRunner'

export function PlanPracticePage() {
  const { kind = 'daily' } = useParams()
  const [searchParams] = useSearchParams()
  const history = useAppStore((state) => state.history)
  const wrongBook = useAppStore((state) => state.wrongBook)

  const validKind = strategyCatalog.some((item) => item.kind === kind)
    ? (kind as StrategyKind)
    : 'daily'
  const modeParam = searchParams.get('mode')
  const mode = modeParam === 'exam' ? 'exam' : validKind === 'wrong' ? 'review' : 'practice'

  const plan = useMemo(
    () => buildPlan(validKind, { history, wrongBook }),
    [validKind, history, wrongBook],
  )
  const meta = strategyCatalog.find((item) => item.kind === validKind)!

  return (
    <PracticeRunner
      questions={plan.questions}
      title={meta.title}
      subtitle="策略练习"
      mode={mode}
      historyCollectionId={`plan:${validKind}`}
      historyTitle={`策略 · ${meta.title}`}
      backTo={`/strategy/${validKind}`}
      emptyHint={validKind === 'wrong' ? '错题本为空，先去练习几组' : '暂时无法生成练习'}
    />
  )
}
