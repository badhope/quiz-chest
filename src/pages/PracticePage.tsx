import { useParams, useSearchParams } from 'react-router-dom'
import { getCollection } from '../data'
import { PracticeRunner } from '../components/question/PracticeRunner'
import type { SessionMode } from '../lib/quiz'

export function PracticePage() {
  const { collectionId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const collection = getCollection(collectionId)

  const modeParam = searchParams.get('mode')
  const mode: SessionMode =
    modeParam === 'exam' ? 'exam' : modeParam === 'review' ? 'review' : 'practice'

  if (!collection) {
    return (
      <div className="practice-missing">
        <h1>题库不存在</h1>
      </div>
    )
  }

  return (
    <PracticeRunner
      questions={collection.questions}
      title={collection.title}
      subtitle={collection.exam}
      mode={mode}
      timeLimitSec={mode === 'exam' ? collection.durationMin * 60 : undefined}
      historyCollectionId={collection.id}
      historyTitle={collection.title}
      historyDomainId={collection.domainId}
      backTo={`/collection/${collection.id}`}
    />
  )
}
