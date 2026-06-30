export const QUESTION_TYPES = ['choice', 'true_false', 'blank', 'short', 'cloze'] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export type QuestionOption = {
  label: string
  text: string
}

export type OcrBox = {
  x: number
  y: number
  width: number
  height: number
}

export type OcrLine = {
  id: string
  text: string
  confidence: number
  box: OcrBox
}

export type OcrEngineKind = 'pdf_text' | 'pdf_text_low_quality' | 'rapidocr' | 'paddle' | 'browser_onnx' | 'manual' | 'pending' | 'failed'

export type OcrReviewState = 'confirmed' | 'needs_review' | 'ignored'

export type OcrQuestionCandidate = {
  id: string
  pageNumber: number
  type: QuestionType
  stem: string
  options: QuestionOption[]
  answer: string
  raw: string
  confidence: number
  warnings: string[]
  ignored: boolean
  reviewState: OcrReviewState
  engine: OcrEngineKind
  visual: QuestionVisual
}

export type OcrPage = {
  pageNumber: number
  assetId: string
  width: number
  height: number
  engine?: OcrEngineKind
  pageReviewState?: OcrReviewState
  candidateCount?: number
  error?: string
  lines: OcrLine[]
  candidates?: OcrQuestionCandidate[]
}

export type OcrSourceKind = 'pdf' | 'image' | 'text'

export type OcrImportMode = 'auto' | 'manual_text'

export type OcrJobStatus = 'processing' | 'complete' | 'failed'

export type QuestionVisual = {
  source: 'ocr' | 'synthetic_text' | 'manual'
  assetId: string
  pageNumber: number
  pageWidth: number
  pageHeight: number
  box: OcrBox
  lineIds: string[]
  confidence: number
  engine?: OcrEngineKind
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
  ignored?: boolean
  ocrReviewState?: OcrReviewState
  visual?: QuestionVisual
}

export type StudySet = {
  id: string
  title: string
  sourceFile: string
  questions: ParsedQuestion[]
  ocr?: {
    enabled: boolean
    mode: OcrImportMode
    sourceKind: OcrSourceKind
    jobId?: string
    status?: OcrJobStatus
    processedPages?: number
    totalPages?: number
    error?: string
    pages: OcrPage[]
  }
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
  ocr?: ImportedOcr
}

export type ImportedOcrAsset = {
  id: string
  mimeType: string
  dataUrl: string
  width: number
  height: number
}

export type ImportedOcr = {
  mode: OcrImportMode
  sourceKind: OcrSourceKind
  jobId?: string
  status?: OcrJobStatus
  processedPages?: number
  totalPages?: number
  error?: string
  pages: OcrPage[]
  assets: ImportedOcrAsset[]
}

export type ImportOptions = {
  textOcrEnabled: boolean
}

export type StudyAsset = {
  id: string
  studySetId: string
  mimeType: string
  width: number
  height: number
  blob: Blob
  createdAt: number
}
