import type {
  StudyItem,
  StudyExplanation,
  StudyMode,
  StudyOverview,
  StudySession,
  VocabBookExport,
  VocabRepairResult,
  WordBook,
  WordDraft,
  WordEntry,
  WordProgress,
} from '../../types'
import { requestJson } from './requestJson'

type BooksResponse = {
  books: WordBook[]
}

type BookResponse = {
  book: WordBook
}

type WordsResponse = {
  words: WordEntry[]
  total: number
  limit: number
  offset: number
}

type StartStudyResponse = {
  session: StudySession
  items: StudyItem[]
}

type SubmitAnswerResponse = {
  correct: boolean
  userAnswer: string
  correctAnswer: string
  word: StudyItem['word']
  progress: WordProgress
  session: StudySession
}

type OverviewResponse = {
  overview: StudyOverview
}

type StudyExplanationsResponse = {
  skipped: boolean
  explanations: StudyExplanation[]
}

type GeneratePhoneticsResponse = {
  requestedCount: number
  updatedCount: number
  skippedCount: number
  remainingCount: number
  words: WordEntry[]
}

export type StartStudyPayload = {
  bookId: string
  mode: StudyMode
  count: number
  reviewOnly: boolean
}

export async function fetchBooks(): Promise<WordBook[]> {
  const payload = await requestJson<BooksResponse>('/api/books')
  return payload.books
}

export async function createBook(draft: Pick<WordBook, 'name' | 'description' | 'language'>): Promise<WordBook> {
  const payload = await requestJson<BookResponse>('/api/books', {
    method: 'POST',
    body: JSON.stringify(draft),
  })
  return payload.book
}

export async function updateBook(
  bookId: string,
  draft: Pick<WordBook, 'name' | 'description' | 'language'>,
): Promise<WordBook> {
  const payload = await requestJson<BookResponse>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  })
  return payload.book
}

export async function deleteBook(bookId: string): Promise<void> {
  await requestJson<void>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: 'DELETE',
  })
}

export async function exportBookData(bookId: string): Promise<VocabBookExport> {
  return requestJson<VocabBookExport>(`/api/books/${encodeURIComponent(bookId)}/export`)
}

export async function fetchWords(
  bookId: string,
  query = '',
  options: { limit?: number; offset?: number } = {},
): Promise<WordsResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 80),
    offset: String(options.offset ?? 0),
  })
  if (query.trim()) params.set('query', query.trim())
  return requestJson<WordsResponse>(`/api/books/${encodeURIComponent(bookId)}/words?${params}`)
}

export async function createWord(bookId: string, draft: WordDraft): Promise<WordEntry> {
  const payload = await requestJson<{ word: WordEntry }>(`/api/books/${encodeURIComponent(bookId)}/words`, {
    method: 'POST',
    body: JSON.stringify(draft),
  })
  return payload.word
}

export async function updateWord(wordId: string, draft: WordDraft): Promise<WordEntry> {
  const payload = await requestJson<{ word: WordEntry }>(`/api/words/${encodeURIComponent(wordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  })
  return payload.word
}

export async function disableWord(wordId: string): Promise<void> {
  await requestJson<void>(`/api/words/${encodeURIComponent(wordId)}`, {
    method: 'DELETE',
  })
}

export async function generateBookPhonetics(
  bookId: string,
  options: { limit?: number } = {},
): Promise<GeneratePhoneticsResponse> {
  return requestJson<GeneratePhoneticsResponse>(`/api/books/${encodeURIComponent(bookId)}/phonetics`, {
    method: 'POST',
    body: JSON.stringify({ limit: options.limit ?? 120 }),
  })
}

export async function repairBookWords(
  bookId: string,
  options: { limit?: number } = {},
): Promise<VocabRepairResult> {
  return requestJson<VocabRepairResult>(`/api/books/${encodeURIComponent(bookId)}/repair`, {
    method: 'POST',
    body: JSON.stringify({ limit: options.limit ?? 40 }),
  })
}

export async function startStudy(payload: StartStudyPayload): Promise<StartStudyResponse> {
  return requestJson<StartStudyResponse>('/api/study/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function submitAnswer(
  sessionId: string,
  payload: { wordId: string; mode: StudyItem['mode']; userAnswer: string },
): Promise<SubmitAnswerResponse> {
  return requestJson<SubmitAnswerResponse>(`/api/study/${encodeURIComponent(sessionId)}/answer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestStudyExplanations(
  sessionId: string,
  items: StudyItem[],
): Promise<StudyExplanationsResponse> {
  return requestJson<StudyExplanationsResponse>(`/api/study/${encodeURIComponent(sessionId)}/explanations`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export async function fetchOverview(bookId: string): Promise<StudyOverview> {
  const payload = await requestJson<OverviewResponse>(`/api/stats/overview?bookId=${encodeURIComponent(bookId)}`)
  return payload.overview
}
