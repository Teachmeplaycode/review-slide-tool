export const QUESTION_TYPES = ['choice', 'true_false', 'blank', 'short', 'cloze'] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export type QuestionOption = {
  label: string
  text: string
}

export type ParsedQuestion = {
  id: string
  type: QuestionType
  stem: string
  options: QuestionOption[]
  answer: string
  raw: string
  confidence: number
  warnings: string[]
  enabled: boolean
}

export type StudySet = {
  id: string
  title: string
  sourceFile: string
  questions: ParsedQuestion[]
  createdAt: number
  updatedAt: number
}

export type QuizConfig = {
  count: number
  types: QuestionType[]
  enableCloze: boolean
  clozeRatio: number
  reviewMode: ReviewMode
}

export type ClozeBlank = {
  id: string
  answer: string
}

export type ClozePayload = {
  text: string
  blanks: ClozeBlank[]
}

export type QuizQuestion = ParsedQuestion & {
  sourceType: QuestionType
  cloze?: ClozePayload
}

export type UserAnswer = {
  questionId: string
  value: string | string[]
}

export type GradeStatus = 'correct' | 'partial' | 'review' | 'wrong'

export type ResultFilter = 'all' | 'wrong' | 'review' | 'correct'

export type ReviewMode = 'random' | 'mistakes_first' | 'mistakes_only'

export type GradedQuestion = {
  question: QuizQuestion
  userAnswer: string | string[]
  expectedAnswer: string
  score: number
  status: GradeStatus
  detail: string
}

export type Attempt = {
  id: string
  studySetId: string
  answers: UserAnswer[]
  results: GradedQuestion[]
  score: number
  createdAt: number
}

export type QuestionReviewStat = {
  id: string
  studySetId: string
  questionId: string
  attempts: number
  correctCount: number
  reviewCount: number
  wrongCount: number
  correctStreak: number
  lastStatus: GradeStatus
  lastScore: number
  lastAttemptAt: number
  updatedAt: number
}

export type ImportedText = {
  title: string
  sourceFile: string
  text: string
}
