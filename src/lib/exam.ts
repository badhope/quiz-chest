import type { ExamResult, ExamTypeResult } from '../data/records'
import type { Question, QuestionType } from '../data/types'
import { isAnswered, isCorrect } from './quiz'

/**
 * 模考按题型赋分。
 *
 * 不把「多选」和「判断」都算 1 分：多选题要逐个选项判断，漏选、多选都算错，
 * 判断只有两个分支。分值固定而不是让用户逐题配分，是为了不让一次模考先变成
 * 一张分值表；如果哪天要支持学校卷的 100 分制，再在题目上加可选 points，
 * 而不是现在先做一套没人维护的自定义分值。
 */
export const EXAM_TYPE_POINTS: Record<QuestionType, number> = {
  single: 2,
  multiple: 3,
  judge: 1,
  fill: 2,
  short: 4,
}

/** 及格线固定为满分的 60%，向上取整，避免 59.5 这种晦涩的分数线。 */
export const EXAM_PASS_RATIO = 0.6

export const EXAM_POINT_LABELS: Record<QuestionType, string> = {
  single: '2 分/题',
  multiple: '3 分/题',
  judge: '1 分/题',
  fill: '2 分/题',
  short: '4 分/题',
}

export function questionPoints(type: QuestionType): number {
  return EXAM_TYPE_POINTS[type]
}

const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge', 'fill', 'short']

/**
 * 结算一次模考。未作答按 0 分；答错也按 0 分，不做负分。
 * 返回按题型聚合的分值，结果页和记录页都读这一份，避免两套算法。
 */
export function scoreExam(
  questions: Question[],
  answers: Record<string, number[]>,
  textAnswers: Record<string, string> = {},
): ExamResult {
  const byType = new Map<QuestionType, ExamTypeResult>()
  for (const type of TYPE_ORDER) {
    byType.set(type, {
      type,
      correct: 0,
      answered: 0,
      total: 0,
      score: 0,
      fullScore: 0,
    })
  }

  let score = 0
  let fullScore = 0
  for (const question of questions) {
    const points = questionPoints(question.type)
    const bucket = byType.get(question.type)
    if (!bucket) continue
    bucket.total += 1
    bucket.fullScore += points
    fullScore += points

    const picked = answers[question.id] ?? []
    const text = textAnswers[question.id] ?? ''
    if (isAnswered(picked, text)) {
      bucket.answered += 1
      if (isCorrect(question, picked, text)) {
        bucket.correct += 1
        bucket.score += points
        score += points
      }
    }
  }

  const passScore = Math.ceil(fullScore * EXAM_PASS_RATIO)
  return {
    score,
    fullScore,
    passScore,
    passed: fullScore > 0 && score >= passScore,
    types: TYPE_ORDER.map((type) => byType.get(type)!).filter((item) => item.total > 0),
  }
}
