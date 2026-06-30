import type {
  StudyItem,
  StudyMode,
  StudyOverview,
  StudySession,
  WordBook,
  WordDraft,
  WordEntry,
  WordProgress,
} from '../../types'
import { requestJson } from './requestJson'

type BooksResponse = {
  books: WordBook[]
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

export async function fetchWords(bookId: string, query = ''): Promise<WordsResponse> {
  const params = new URLSearchParams({ limit: '80', offset: '0' })
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

export async function fetchOverview(bookId: string): Promise<StudyOverview> {
  const payload = await requestJson<OverviewResponse>(`/api/stats/overview?bookId=${encodeURIComponent(bookId)}`)
  return payload.overview
}
