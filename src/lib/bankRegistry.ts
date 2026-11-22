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

export type BankListener = () => void

let listeners = new Set<BankListener>()

export function onBanksChange(listener: BankListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitBanksChange(): void {
  for (const listener of [...listeners]) listener()
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

export function resetListenersForTest(): void {
  listeners = new Set()
}
