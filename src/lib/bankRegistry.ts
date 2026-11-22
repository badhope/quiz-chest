import type { Question } from '../data/types'

export type QuestionBankOrigin = 'builtin' | 'imported'

export interface BankMeta {
  id: string
  title: string
  subtitle: string
  exam: string
  icon: string
  accent: string
  origin: QuestionBankOrigin
  importedAt: number
  questionCount: number
}

export function makeImportedQuestion(
  bankId: string,
  index: number,
  seed: Omit<Question, 'id' | 'collectionId'>,
): Question {
  return {
    ...seed,
    id: `${bankId}-${index + 1}`,
    collectionId: bankId,
  }
}

