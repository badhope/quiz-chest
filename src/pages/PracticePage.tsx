import { useParams, useSearchParams } from 'react-router-dom'
import { getCollection } from '../data'
import { PracticeRunner } from '../components/question/PracticeRunner'
import { MissingPage } from '../components/ui/MissingPage'
import { Layers } from '../components/ui/icons'
import { parseSessionMode } from '../lib/quiz'

export function PracticePage() {
  const { collectionId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const collection = getCollection(collectionId)

  const mode = parseSessionMode(searchParams.get('mode'))

  if (!collection) {
    return (
      <MissingPage
        className="practice-missing"
        icon={<Layers />}
        title="题库不存在"
        description="链接可能已过期，或这个题库已经被删除。"
        to="/catalog"
        linkLabel="返回题库总览"
      />
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
