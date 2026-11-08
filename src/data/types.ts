export type DomainId =
  | 'k12'
  | 'university'
  | 'career'
  | 'language'
  | 'coding'
  | 'public'
  | 'general'
  | 'imported'

export type Level = '入门' | '进阶' | '挑战'

export type QuestionType = 'single' | 'multiple' | 'judge'

export type Difficulty = 1 | 2 | 3

export type IconKey =
  | 'graduation'
  | 'school'
  | 'briefcase'
  | 'languages'
  | 'code'
  | 'landmark'
  | 'compass'
  | 'shapes'
  | 'ruler'
  | 'scroll'
  | 'atom'
  | 'sigma'
  | 'grid'
  | 'chart'
  | 'book'
  | 'cpu'
  | 'calculator'
  | 'hardhat'
  | 'pill'
  | 'scale'
  | 'globe'
  | 'headphones'
  | 'braces'
  | 'file-code'
  | 'binary'
  | 'database'
  | 'network'
  | 'message'
  | 'pen'
  | 'flask'
  | 'palette'

export interface Domain {
  id: DomainId
  name: string
  en: string
  tagline: string
  description: string
  icon: IconKey
  accent: string
  index: string
}

export interface Track {
  id: string
  domainId: DomainId
  name: string
  short: string
  description: string
}

export interface Collection {
  id: string
  domainId: DomainId
  trackId: string
  title: string
  subtitle: string
  description: string
  icon: IconKey
  level: Level
  exam: string
  durationMin: number
  heat: number
  tags: string[]
  updated: string
}

export interface GoalStep {
  collectionId: string
  phase: string
  note: string
}

export interface Goal {
  id: string
  title: string
  audience: string
  outcome: string
  durationWeeks: number
  intensity: '轻量' | '标准' | '冲刺'
  accent: string
  icon: IconKey
  keywords: string[]
  steps: GoalStep[]
}

export interface Question {
  id: string
  collectionId: string
  type: QuestionType
  stem: string
  options: string[]
  answer: number[]
  explanation: string
  difficulty: Difficulty
  tags: string[]
  /**
   * 题干配图。支持两种形式：
   *   - `https://…` 外链（导入时只存 URL，不下载）
   *   - `data:image/…;base64,…` 内嵌（离线优先场景必须自包含）
   * 图表题、几何题、阅读理解题都靠它；没有图时为 undefined。
   */
  image?: string
  /** 选项配图，长度与 options 对齐；某项为空表示纯文字选项。 */
  optionImages?: string[]
}

export type QuestionSeed = Omit<Question, 'id' | 'collectionId'>

export interface CollectionWithQuestions extends Collection {
  questions: Question[]
}

export function makeQuestions(
  collectionId: string,
  seeds: QuestionSeed[],
): Question[] {
  return seeds.map((seed, index) => ({
    ...seed,
    id: `${collectionId}-${index + 1}`,
    collectionId,
  }))
}
