import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudyItem, StudySession, WordBook, WordEntry } from '../types'
import {
  fetchBooks,
  fetchOverview,
  fetchWords,
  startStudy,
  submitAnswer,
} from '../services/api/vocabApi'
import { useVocabStore } from './vocab'

vi.mock('../services/api/vocabApi', () => ({
  createWord: vi.fn(),
  disableWord: vi.fn(),
  fetchBooks: vi.fn(),
  fetchOverview: vi.fn(),
  fetchWords: vi.fn(),
  startStudy: vi.fn(),
  submitAnswer: vi.fn(),
  updateWord: vi.fn(),
}))

describe('vocab store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(fetchBooks).mockResolvedValue([book])
    vi.mocked(fetchOverview).mockResolvedValue({
      bookId: book.id,
      totalWords: 100,
      learnedWords: 4,
      reviewWords: 2,
      averageMastery: 1.8,
      totalAttempts: 6,
      correctCount: 4,
      wrongCount: 2,
    })
    vi.mocked(fetchWords).mockResolvedValue({ words: [word], total: 1, limit: 80, offset: 0 })
    vi.mocked(startStudy).mockResolvedValue({ session, items: [studyItem] })
    vi.mocked(submitAnswer).mockResolvedValue({
      correct: true,
      userAnswer: 'ability',
      correctAnswer: 'ability',
      word: studyItem.word,
      progress: { ...word.progress, attempts: 1, correctCount: 1, mastery: 1, lastCorrect: true },
      session: { ...session, correctCount: 1 },
    })
  })

  it('loads the default book and its overview', async () => {
    const store = useVocabStore()

    await store.init()

    expect(store.selectedBookId).toBe(book.id)
    expect(store.words).toEqual([word])
    expect(store.overview?.totalWords).toBe(100)
  })

  it('starts a study session and opens the training slide', async () => {
    const store = useVocabStore()
    await store.init()

    await store.startStudySession()

    expect(startStudy).toHaveBeenCalledWith({
      bookId: book.id,
      mode: 'mixed',
      count: 10,
      reviewOnly: false,
    })
    expect(store.currentItem?.wordId).toBe(studyItem.wordId)
    expect(store.slideIndex).toBe(2)
  })

  it('submits the current answer and moves to result after the last item', async () => {
    const store = useVocabStore()
    await store.init()
    await store.startStudySession()

    store.currentAnswer = 'ability'
    await store.submitCurrentAnswer()
    await store.nextItem()

    expect(submitAnswer).toHaveBeenCalledWith(session.id, {
      wordId: studyItem.wordId,
      mode: studyItem.mode,
      userAnswer: 'ability',
    })
    expect(store.correctCount).toBe(1)
    expect(store.slideIndex).toBe(3)
  })
})

const book: WordBook = {
  id: 'basic_english',
  name: '英语基础词库',
  description: '基础单词',
  language: 'en',
  wordCount: 100,
  learnedCount: 0,
  reviewCount: 0,
  createdAt: 1,
  updatedAt: 1,
}

const word: WordEntry = {
  id: 'word_1',
  bookId: 'basic_english',
  word: 'ability',
  phonetic: '/əˈbɪləti/',
  partOfSpeech: 'n.',
  meaningZh: '能力；才能',
  exampleEn: 'She has the ability to solve difficult problems.',
  exampleZh: '她有解决难题的能力。',
  tags: 'basic',
  difficulty: 2,
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
  progress: {
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    mastery: 0,
    lastCorrect: null,
    lastAnswer: '',
    lastStudiedAt: null,
    updatedAt: null,
  },
}

const session: StudySession = {
  id: 'session_1',
  bookId: 'basic_english',
  mode: 'mixed',
  totalCount: 1,
  correctCount: 0,
  wrongCount: 0,
  createdAt: 1,
}

const studyItem: StudyItem = {
  id: 'item_1',
  wordId: 'word_1',
  mode: 'spelling',
  prompt: '能力；才能',
  choices: [],
  word: {
    id: 'word_1',
    word: 'ability',
    phonetic: '/əˈbɪləti/',
    partOfSpeech: 'n.',
    meaningZh: '能力；才能',
    exampleEn: 'She has the ability to solve difficult problems.',
    exampleZh: '她有解决难题的能力。',
  },
}
