import { defineStore } from 'pinia'
import type {
  StudyAnswerResult,
  StudyItem,
  StudyMode,
  StudyOverview,
  StudySession,
  VocabStudyConfig,
  WordBook,
  WordDraft,
  WordEntry,
} from '../types'
import {
  createWord,
  disableWord,
  fetchBooks,
  fetchOverview,
  fetchWords,
  startStudy,
  submitAnswer,
  updateWord,
} from '../services/api/vocabApi'

type VocabState = {
  slideIndex: number
  unlockedIndex: number
  books: WordBook[]
  selectedBookId: string
  overview: StudyOverview | null
  words: WordEntry[]
  wordTotal: number
  wordQuery: string
  editingWordId: string
  wordDraft: WordDraft
  config: VocabStudyConfig
  session: StudySession | null
  studyItems: StudyItem[]
  activeItemIndex: number
  currentAnswer: string
  answerResults: StudyAnswerResult[]
  loading: boolean
  studying: boolean
  savingWord: boolean
  error: string
}

export const emptyWordDraft = (): WordDraft => ({
  word: '',
  phonetic: '',
  partOfSpeech: '',
  meaningZh: '',
  exampleEn: '',
  exampleZh: '',
  tags: '',
  difficulty: 1,
})

export const useVocabStore = defineStore('vocab', {
  state: (): VocabState => ({
    slideIndex: 0,
    unlockedIndex: 0,
    books: [],
    selectedBookId: '',
    overview: null,
    words: [],
    wordTotal: 0,
    wordQuery: '',
    editingWordId: '',
    wordDraft: emptyWordDraft(),
    config: {
      mode: 'mixed',
      count: 10,
      reviewOnly: false,
    },
    session: null,
    studyItems: [],
    activeItemIndex: 0,
    currentAnswer: '',
    answerResults: [],
    loading: false,
    studying: false,
    savingWord: false,
    error: '',
  }),

  getters: {
    selectedBook(state): WordBook | null {
      return state.books.find((book) => book.id === state.selectedBookId) ?? null
    },
    currentItem(state): StudyItem | null {
      return state.studyItems[state.activeItemIndex] ?? null
    },
    currentResult(state): StudyAnswerResult | null {
      const item = state.studyItems[state.activeItemIndex]
      if (!item) return null
      return state.answerResults.find((result) => result.item.id === item.id) ?? null
    },
    answeredCount(state): number {
      return state.answerResults.length
    },
    correctCount(state): number {
      return state.answerResults.filter((result) => result.correct).length
    },
    wrongResults(state): StudyAnswerResult[] {
      return state.answerResults.filter((result) => !result.correct)
    },
    accuracy(): number {
      if (this.answerResults.length === 0) return 0
      return Math.round((this.correctCount / this.answerResults.length) * 100)
    },
    canStart(state): boolean {
      return Boolean(state.selectedBookId) && !state.studying
    },
  },

  actions: {
    async init() {
      this.loading = true
      this.error = ''

      try {
        this.books = await fetchBooks()
        if (!this.selectedBookId && this.books.length) {
          this.selectedBookId = this.books[0].id
        }
        await this.refreshSelectedBookData()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.loading = false
      }
    },

    goTo(index: number) {
      if (index < 0 || index > this.unlockedIndex) return
      this.slideIndex = index
    },

    unlockTo(index: number) {
      this.unlockedIndex = Math.max(this.unlockedIndex, index)
      this.slideIndex = index
    },

    async selectBook(bookId: string) {
      this.selectedBookId = bookId
      this.config.reviewOnly = false
      await this.refreshSelectedBookData()
    },

    async refreshSelectedBookData() {
      if (!this.selectedBookId) return
      const [wordsPayload, overview] = await Promise.all([
        fetchWords(this.selectedBookId, this.wordQuery),
        fetchOverview(this.selectedBookId),
      ])
      this.words = wordsPayload.words
      this.wordTotal = wordsPayload.total
      this.overview = overview
      this.books = await fetchBooks()
    },

    async searchWords(query: string) {
      this.wordQuery = query
      if (!this.selectedBookId) return
      const payload = await fetchWords(this.selectedBookId, query)
      this.words = payload.words
      this.wordTotal = payload.total
    },

    editWord(word: WordEntry) {
      this.editingWordId = word.id
      this.wordDraft = {
        word: word.word,
        phonetic: word.phonetic,
        partOfSpeech: word.partOfSpeech,
        meaningZh: word.meaningZh,
        exampleEn: word.exampleEn,
        exampleZh: word.exampleZh,
        tags: word.tags,
        difficulty: word.difficulty,
      }
    },

    resetWordDraft() {
      this.editingWordId = ''
      this.wordDraft = emptyWordDraft()
    },

    async saveWordDraft() {
      if (!this.selectedBookId) return
      this.savingWord = true
      this.error = ''

      try {
        if (this.editingWordId) {
          await updateWord(this.editingWordId, this.wordDraft)
        } else {
          await createWord(this.selectedBookId, this.wordDraft)
        }
        this.resetWordDraft()
        await this.refreshSelectedBookData()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.savingWord = false
      }
    },

    async removeWord(wordId: string) {
      await disableWord(wordId)
      await this.refreshSelectedBookData()
    },

    setMode(mode: StudyMode) {
      this.config.mode = mode
    },

    async startStudySession(overrides: Partial<VocabStudyConfig> = {}) {
      if (!this.selectedBookId) return
      this.studying = true
      this.error = ''

      try {
        this.config = { ...this.config, ...overrides }
        const payload = await startStudy({
          bookId: this.selectedBookId,
          mode: this.config.mode,
          count: this.config.count,
          reviewOnly: this.config.reviewOnly,
        })
        this.session = payload.session
        this.studyItems = payload.items
        this.activeItemIndex = 0
        this.currentAnswer = ''
        this.answerResults = []
        this.unlockTo(2)
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.studying = false
      }
    },

    chooseAnswer(answer: string) {
      this.currentAnswer = answer
    },

    setActiveItem(index: number) {
      if (index < 0 || index >= this.studyItems.length) return
      this.activeItemIndex = index
      const item = this.studyItems[index]
      this.currentAnswer = this.answerResults.find((result) => result.item.id === item.id)?.userAnswer ?? ''
    },

    async submitCurrentAnswer() {
      const item = this.currentItem
      if (!this.session || !item || this.currentResult || !this.currentAnswer.trim()) return
      this.studying = true
      this.error = ''

      try {
        const payload = await submitAnswer(this.session.id, {
          wordId: item.wordId,
          mode: item.mode,
          userAnswer: this.currentAnswer,
        })
        this.answerResults.push({
          item,
          correct: payload.correct,
          userAnswer: payload.userAnswer,
          correctAnswer: payload.correctAnswer,
          word: payload.word,
          progress: payload.progress,
        })
        this.session = payload.session
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.studying = false
      }
    },

    async nextItem() {
      if (this.activeItemIndex >= this.studyItems.length - 1) {
        await this.finishStudy()
        return
      }

      this.setActiveItem(this.activeItemIndex + 1)
    },

    async finishStudy() {
      await this.refreshSelectedBookData()
      this.unlockTo(3)
    },

    async startMistakeReview() {
      this.config.reviewOnly = true
      await this.startStudySession({ reviewOnly: true })
    },
  },
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败'
}
