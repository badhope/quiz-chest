import type { DailyStat, HistoryEntry, WrongEntry } from '../data/records'
import { dateKey } from './datetime'
import { dueCount } from './review'
import { summarizeDaily } from './stats'
import { domainAccuracy } from './strategy'
import { getLibraryCollections, type LibraryCollection } from './library'

export type CoachTone = 'focus' | 'review' | 'steady'

export interface CoachTip {
  id: string
  tone: CoachTone
  title: string
  body: string
  to: string
  action: string
}

export interface CoachReport {
  headline: string
  tips: CoachTip[]
}

// 这是本地的学情建议，不调用大模型。输入只有历史、错题和每日统计，
// 输出也只是一组可解释的练习入口；以后要接本地模型，从这里替换生成层即可。
export function buildCoachReport(input: {
  history: HistoryEntry[]
  wrongBook: Record<string, WrongEntry>
  daily: Record<string, DailyStat>
  library?: LibraryCollection[]
  now?: number
}): CoachReport {
  const now = input.now ?? Date.now()
  const library = input.library ?? getLibraryCollections()
  const summary = summarizeDaily(input.daily, now)
  const todayAnswered = input.daily[dateKey(now)]?.answered ?? 0
  const weak = domainAccuracy(input.history, library).filter((item) => item.accuracy < 75)
  const due = dueCount(Object.values(input.wrongBook), now)
  const tips: CoachTip[] = []

  if (due > 0) {
    tips.push({
      id: 'review-due',
      tone: 'review',
      title: '先把到期的错题清掉',
      body: `错题本里有 ${due} 道到期题。先复习这组，再开新题，记忆留存会稳一些。`,
      to: '/review?tab=wrong',
      action: '去复习',
    })
  }

  if (weak.length > 0) {
    const first = weak[0]
    tips.push({
      id: 'weak-domain',
      tone: 'focus',
      title: `今天优先补 ${first.name}`,
      body: `最近正确率 ${first.accuracy}%，是当前最低的一块。抽 10 题集中做，不要平均用力。`,
      to: '/strategy/weak',
      action: '练薄弱项',
    })
  }

  if (tips.length === 0) {
    tips.push({
      id: 'steady',
      tone: 'steady',
      title: summary.totalAnswered === 0 ? '先跑一遍顺序练习' : '保持节奏，别突然加量',
      body:
        summary.totalAnswered === 0
          ? '还没有作答记录。先选一个题库做 10 题，我才能看出你哪块弱。'
          : `累计正确率 ${summary.accuracy}%，连续 ${summary.streak} 天。今天做一组每日一练就够。`,
      to: summary.totalAnswered === 0 ? '/catalog' : '/strategy/daily',
      action: summary.totalAnswered === 0 ? '选题库' : '开今日一练',
    })
  }

  if (todayAnswered < 20 && tips.length < 2) {
    tips.push({
      id: 'today-gap',
      tone: 'steady',
      title: `今日还差 ${20 - todayAnswered} 题`,
      body: '不用一次做完，拆成两组更不容易烦。做完记得看一眼解析，别只对答案。',
      to: '/strategy/daily',
      action: '继续做',
    })
  }

  return {
    headline:
      summary.totalAnswered === 0
        ? '先做一组，让我认识你'
        : due > 0
          ? '今天先清错题，再开新题'
          : weak.length > 0
            ? `先把 ${weak[0].name} 的坑填上`
            : '保持现在的节奏',
    tips: tips.slice(0, 3),
  }
}
