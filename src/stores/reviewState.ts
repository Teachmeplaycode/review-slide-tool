import type {
  GradedQuestion,
  OcrPage,
  QuestionReviewStat,
  QuizConfig,
  QuizQuestion,
  ResultFilter,
  StudySet,
} from '../types'

export type ReviewState = {
  slideIndex: number
  unlockedIndex: number
  recentSets: StudySet[]
  currentSet: StudySet | null
  assetUrls: Record<string, string>
  reviewStats: QuestionReviewStat[]
  quizConfig: QuizConfig
  quizQuestions: QuizQuestion[]
  activeQuestionIndex: number
  answers: Record<string, string | string[]>
  results: GradedQuestion[]
  resultFilter: ResultFilter
  showStandardAnswers: boolean
  textOcrEnabled: boolean
  ocrPolling: boolean
  browserOcrBusy: boolean
  browserOcrMessage: string
  browserOcrDraft: OcrPage | null
  importing: boolean
  error: string
}

export function createReviewState(): ReviewState {
  return {
    slideIndex: 0,
    unlockedIndex: 0,
    recentSets: [],
    currentSet: null,
    assetUrls: {},
    reviewStats: [],
    quizConfig: {
      count: 20,
      types: ['choice', 'true_false', 'blank', 'short'],
      enableCloze: true,
      clozeRatio: 0.3,
      reviewMode: 'random',
    },
    quizQuestions: [],
    activeQuestionIndex: 0,
    answers: {},
    results: [],
    resultFilter: 'all',
    showStandardAnswers: false,
    textOcrEnabled: false,
    ocrPolling: false,
    browserOcrBusy: false,
    browserOcrMessage: '',
    browserOcrDraft: null,
    importing: false,
    error: '',
  }
}
