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

export type StudyMode = 'recognition' | 'spelling' | 'mixed'

export type WordProgress = {
  attempts: number
  correctCount: number
  wrongCount: number
  mastery: number
  lastCorrect: boolean | null
  lastAnswer: string
  lastStudiedAt: number | null
  updatedAt: number | null
}

export type WordBook = {
  id: string
  name: string
  description: string
  language: string
  wordCount: number
  learnedCount: number
  reviewCount: number
  createdAt: number
  updatedAt: number
}

export type WordEntry = {
  id: string
  bookId: string
  word: string
  phonetic: string
  partOfSpeech: string
  meaningZh: string
  exampleEn: string
  exampleZh: string
  tags: string
  difficulty: number
  enabled: boolean
  createdAt: number
  updatedAt: number
  progress: WordProgress
}

export type WordDraft = {
  word: string
  phonetic: string
  partOfSpeech: string
  meaningZh: string
  exampleEn: string
  exampleZh: string
  tags: string
  difficulty: number
}

export type VocabStudyConfig = {
  mode: StudyMode
  count: number
  reviewOnly: boolean
}

export type StudySession = {
  id: string
  bookId: string
  mode: StudyMode
  totalCount: number
  correctCount: number
  wrongCount: number
  createdAt: number
}

export type StudyItemMode = 'recognition' | 'spelling'

export type StudyItem = {
  id: string
  wordId: string
  mode: StudyItemMode
  prompt: string
  choices: string[]
  word: Pick<WordEntry, 'id' | 'word' | 'phonetic' | 'partOfSpeech' | 'meaningZh' | 'exampleEn' | 'exampleZh'>
}

export type StudyAnswerResult = {
  item: StudyItem
  correct: boolean
  userAnswer: string
  correctAnswer: string
  word: StudyItem['word']
  progress: WordProgress
}

export type StudyExplanation = {
  itemId: string
  wordId: string
  explanation: string
}

export type StudyOverview = {
  bookId: string
  totalWords: number
  learnedWords: number
  reviewWords: number
  averageMastery: number
  totalAttempts: number
  correctCount: number
  wrongCount: number
}

export type AiSettings = {
  provider: 'deepseek'
  baseUrl: string
  model: string
  enabled: boolean
  reviewEnabled: boolean
  hasApiKey: boolean
  apiKeyPreview: string
  createdAt?: number
  updatedAt?: number
}

export type AiSettingsDraft = {
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
  reviewEnabled: boolean
}

export type ImportTargetMode = 'new_book' | 'merge_current'

export type ImportJob = {
  id: string
  sourceFile: string
  targetBookId: string
  mode: ImportTargetMode
  provider: 'local' | 'deepseek'
  status: 'success' | 'failed'
  rawTextLength: number
  importedCount: number
  skippedCount: number
  errorMessage: string
  createdAt: number
}

export type VocabImportResult = {
  job: ImportJob
  book: WordBook
  importedCount: number
  skippedCount: number
  rawTextLength: number
  sourceFile: string
  provider: 'local' | 'deepseek'
  usedAi: boolean
  targetMode: ImportTargetMode
  previewWords: WordDraft[]
}

export type VocabBookExport = {
  book: Pick<WordBook, 'id' | 'name' | 'description' | 'language'>
  exportedAt: number
  wordCount: number
  words: WordDraft[]
}
