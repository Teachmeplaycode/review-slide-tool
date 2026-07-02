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
  language?: string
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

export type VocabRepairResult = {
  requestedCount: number
  updatedCount: number
  skippedCount: number
  remainingCount: number
  words: WordEntry[]
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

export type SearchSettings = {
  provider: 'tavily'
  baseUrl: string
  enabled: boolean
  hasApiKey: boolean
  apiKeyPreview: string
  createdAt?: number
  updatedAt?: number
}

export type SearchSettingsDraft = {
  apiKey: string
  baseUrl: string
  enabled: boolean
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

export type AiVocabLevel = '入门' | '初级' | '中级' | '高级' | '专业'

export type AiVocabGenerationMode = 'quick' | 'chat'

export type AiVocabChatMessage = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: number
}

export type AiVocabResearchSource = {
  title: string
  url: string
  content: string
  publishedDate?: string
  score?: number
}

export type AiVocabProfile = {
  language: string
  topic: string
  level: AiVocabLevel
  scenario: string
  wordCount: number
  bookName: string
  mode?: AiVocabGenerationMode
  retrievalEnabled?: boolean
  conversation?: AiVocabChatMessage[]
  researchSources?: AiVocabResearchSource[]
}

export type AiVocabConversationPlan = {
  message: string
  questions: string[]
  ready: boolean
  profile: Partial<AiVocabProfile>
}

export type AiVocabResearchResult = {
  query: string
  answer: string
  provider: 'tavily'
  sources: AiVocabResearchSource[]
}

export type AiVocabDraft = {
  draftId: string
  provider: 'deepseek'
  profile: AiVocabProfile
  words: WordDraft[]
  createdAt: number
}

export type AiJobType = 'generate_vocab' | 'repair_words'

export type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type AiJobProgress = {
  status: AiJobStatus
  requestedCount: number
  generatedCount: number
  repairedCount?: number
  generatedBatches: number
  totalBatches: number
  currentBatch: number
  requestedBatchSize: number
  activeRequests: number
  completedRequests: number
  retryCount: number
  retrying?: boolean
  remainingCount?: number
  dynamicConcurrency: number
  maxConcurrency: number
  stoppedReason?: string
}

export type AiJob<T = WordDraft | WordEntry> = {
  id: string
  type: AiJobType
  status: AiJobStatus
  payload: Record<string, unknown>
  progress: AiJobProgress
  result: T[]
  errorMessage: string
  cancelRequested: boolean
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}
