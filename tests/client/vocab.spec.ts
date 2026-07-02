import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudyItem, StudySession, WordBook, WordEntry } from '../../src/types'
import {
  createBook,
  deleteBook,
  exportBookData,
  fetchBooks,
  fetchOverview,
  fetchWords,
  generateBookPhonetics,
  repairBookWords,
  requestStudyExplanations,
  startStudy,
  submitAnswer,
  updateBook,
} from '../../src/services/api/vocabApi'
import { createAiJob, subscribeAiJobEvents } from '../../src/services/api/aiVocabApi'
import { useVocabStore } from '../../src/stores/vocab'

vi.mock('../../src/services/api/vocabApi', () => ({
  createBook: vi.fn(),
  createWord: vi.fn(),
  deleteBook: vi.fn(),
  disableWord: vi.fn(),
  exportBookData: vi.fn(),
  fetchBooks: vi.fn(),
  fetchOverview: vi.fn(),
  fetchWords: vi.fn(),
  generateBookPhonetics: vi.fn(),
  repairBookWords: vi.fn(),
  requestStudyExplanations: vi.fn(),
  startStudy: vi.fn(),
  submitAnswer: vi.fn(),
  updateBook: vi.fn(),
  updateWord: vi.fn(),
}))

vi.mock('../../src/services/api/aiVocabApi', () => ({
  createAiJob: vi.fn(),
  subscribeAiJobEvents: vi.fn(),
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
    vi.mocked(createBook).mockResolvedValue({ ...book, id: 'book_new', name: '新版词库', wordCount: 0 })
    vi.mocked(updateBook).mockResolvedValue(book)
    vi.mocked(deleteBook).mockResolvedValue(undefined)
    vi.mocked(exportBookData).mockResolvedValue({
      book: {
        id: book.id,
        name: book.name,
        description: book.description,
        language: book.language,
      },
      exportedAt: 1,
      wordCount: 1,
      words: [{
        word: word.word,
        phonetic: word.phonetic,
        partOfSpeech: word.partOfSpeech,
        meaningZh: word.meaningZh,
        exampleEn: word.exampleEn,
        exampleZh: word.exampleZh,
        tags: word.tags,
        difficulty: word.difficulty,
      }],
    })
    vi.mocked(generateBookPhonetics).mockResolvedValue({
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      remainingCount: 0,
      words: [word],
    })
    vi.mocked(repairBookWords).mockResolvedValue({
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      remainingCount: 0,
      words: [word],
    })
    vi.mocked(createAiJob).mockResolvedValue({
      job: {
        id: 'job_1',
        type: 'repair_words',
        status: 'queued',
        payload: { bookId: book.id },
        progress: {
          status: 'queued',
          requestedCount: 1,
          generatedCount: 0,
          repairedCount: 0,
          generatedBatches: 0,
          totalBatches: 1,
          currentBatch: 0,
          requestedBatchSize: 80,
          activeRequests: 0,
          completedRequests: 0,
          retryCount: 0,
          retrying: false,
          dynamicConcurrency: 16,
          maxConcurrency: 32,
        },
        result: [],
        errorMessage: '',
        cancelRequested: false,
        createdAt: 1,
        startedAt: null,
        completedAt: null,
        updatedAt: 1,
      },
    })
    vi.mocked(subscribeAiJobEvents).mockImplementation(async (_jobId, handlers) => {
      const safeHandlers = handlers ?? {}
      safeHandlers.onStart?.({
        requestedCount: 1,
        generatedCount: 0,
        generatedBatches: 0,
        totalBatches: 1,
        dynamicConcurrency: 16,
      })
      safeHandlers.onBatch?.({
        draftId: 'job_1',
        provider: 'deepseek',
        profile: {
          language: book.language,
          topic: book.name,
          level: 'advanced' as never,
          scenario: '',
          wordCount: 1,
          bookName: book.name,
        },
        words: [word],
        createdAt: 1,
        requestedCount: 1,
        generatedCount: 1,
        generatedBatches: 1,
        totalBatches: 1,
        repairedCount: 1,
        remainingCount: 0,
      })
      safeHandlers.onDone?.({
        requestedCount: 1,
        generatedCount: 1,
        generatedBatches: 1,
        totalBatches: 1,
        repairedCount: 1,
        status: 'succeeded',
      })
    })
    vi.mocked(requestStudyExplanations).mockResolvedValue({
      skipped: false,
      explanations: [{ itemId: studyItem.id, wordId: studyItem.wordId, explanation: 'ability 表示能力，常接不定式。' }],
    })
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

  it('limits AI explanation prefetch payload for large sessions', async () => {
    const manyItems = Array.from({ length: 80 }, (_, index) => ({
      ...studyItem,
      id: `item_${index}`,
      wordId: `word_${index}`,
    }))
    vi.mocked(startStudy).mockResolvedValue({ session: { ...session, totalCount: 80 }, items: manyItems })
    const store = useVocabStore()
    await store.init()

    await store.startStudySession({ count: 80 })
    await vi.waitFor(() => {
      expect(requestStudyExplanations).toHaveBeenCalled()
    })

    expect(requestStudyExplanations).toHaveBeenCalledWith(session.id, manyItems.slice(0, 50))
  })

  it('saves the selected book draft and can generate missing phonetics', async () => {
    const store = useVocabStore()
    await store.init()

    store.bookDraft.name = '新版词库'
    await store.saveBookDraft()
    await store.generateMissingPhonetics()

    expect(updateBook).toHaveBeenCalledWith(book.id, {
      name: '新版词库',
      description: '基础单词',
      language: '英语',
    })
    expect(generateBookPhonetics).toHaveBeenCalledWith(book.id, { limit: 120 })
    expect(store.phoneticStatus).toBe('已补全 1 个读音，跳过 0 个。')
  })

  it('keeps generating phonetics until the book has no remaining missing phonetics', async () => {
    vi.mocked(generateBookPhonetics)
      .mockResolvedValueOnce({
        requestedCount: 120,
        updatedCount: 120,
        skippedCount: 0,
        remainingCount: 10,
        words: [word],
      })
      .mockResolvedValueOnce({
        requestedCount: 10,
        updatedCount: 10,
        skippedCount: 0,
        remainingCount: 0,
        words: [word],
      })
    const store = useVocabStore()
    await store.init()

    await store.generateMissingPhonetics()

    expect(generateBookPhonetics).toHaveBeenCalledTimes(2)
    expect(store.phoneticStatus).toBe('已补全 130 个读音，跳过 0 个。')
  })

  it('repairs incomplete words with AI in batches', async () => {
    const store = useVocabStore()
    await store.init()

    await store.repairSelectedBookWithAi()

    expect(repairBookWords).toHaveBeenCalledWith(book.id, { limit: 40 })
    expect(store.repairStatus).toBe('已修复 1 个词条，跳过 0 个。')
  })

  it('repairs incomplete words with the background AI job', async () => {
    const store = useVocabStore()
    await store.init()

    await store.repairSelectedBookWithAiJob()

    expect(createAiJob).toHaveBeenCalledWith({ type: 'repair_words', payload: { bookId: book.id } })
    expect(subscribeAiJobEvents).toHaveBeenCalledWith('job_1', expect.objectContaining({
      onBatch: expect.any(Function),
      onDone: expect.any(Function),
    }))
    expect(repairBookWords).not.toHaveBeenCalled()
    expect(store.repairingWords).toBe(false)
  })

  it('creates an empty book and selects it', async () => {
    vi.mocked(fetchBooks)
      .mockResolvedValueOnce([book])
      .mockResolvedValue([{ ...book }, { ...book, id: 'book_new', name: '新版词库', wordCount: 0 }])
    const store = useVocabStore()
    await store.init()

    store.newBookDraft.name = '新版词库'
    await store.createBookDraft()

    expect(createBook).toHaveBeenCalledWith({
      name: '新版词库',
      description: '',
      language: '英语',
    })
    expect(store.selectedBookId).toBe('book_new')
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

  it('allows submitting an empty spelling answer', async () => {
    const store = useVocabStore()
    await store.init()
    await store.startStudySession()

    store.currentAnswer = ''
    await store.submitCurrentAnswer()

    expect(submitAnswer).toHaveBeenCalledWith(session.id, {
      wordId: studyItem.wordId,
      mode: studyItem.mode,
      userAnswer: '',
    })
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
