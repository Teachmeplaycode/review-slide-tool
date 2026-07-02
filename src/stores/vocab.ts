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
import { useToastStore } from './toast'
import {
  createBook,
  createWord,
  deleteBook,
  disableWord,
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
  updateWord,
} from '../services/api/vocabApi'
import { createAiJob, subscribeAiJobEvents } from '../services/api/aiVocabApi'

type BookDraft = {
  name: string
  description: string
  language: string
}

const WORD_PAGE_SIZE = 80
const PHONETIC_BATCH_SIZE = 120
const MAX_PHONETIC_BATCHES = 100
const REPAIR_BATCH_SIZE = 40
const MAX_REPAIR_BATCHES = 100

type VocabState = {
  slideIndex: number
  unlockedIndex: number
  books: WordBook[]
  selectedBookId: string
  newBookDraft: BookDraft
  bookDraft: BookDraft
  overview: StudyOverview | null
  words: WordEntry[]
  wordTotal: number
  wordQuery: string
  loadingMoreWords: boolean
  editingWordId: string
  wordDraft: WordDraft
  config: VocabStudyConfig
  session: StudySession | null
  studyItems: StudyItem[]
  activeItemIndex: number
  currentAnswer: string
  answerResults: StudyAnswerResult[]
  studyExplanations: Record<string, string>
  explanationsLoading: boolean
  explanationsError: string
  loading: boolean
  studying: boolean
  savingWord: boolean
  creatingBook: boolean
  savingBook: boolean
  deletingBook: boolean
  exportingBook: boolean
  generatingPhonetics: boolean
  phoneticStatus: string
  repairingWords: boolean
  repairStatus: string
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
    newBookDraft: {
      name: '',
      description: '',
      language: '英语',
    },
    bookDraft: {
      name: '',
      description: '',
      language: '英语',
    },
    overview: null,
    words: [],
    wordTotal: 0,
    wordQuery: '',
    loadingMoreWords: false,
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
    studyExplanations: {},
    explanationsLoading: false,
    explanationsError: '',
    loading: false,
    studying: false,
    savingWord: false,
    creatingBook: false,
    savingBook: false,
    deletingBook: false,
    exportingBook: false,
    generatingPhonetics: false,
    phoneticStatus: '',
    repairingWords: false,
    repairStatus: '',
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
    hasMoreWords(state): boolean {
      return state.words.length < state.wordTotal
    },
    wordDisplayLabel(state): string {
      if (!state.wordTotal) return '0 个结果'
      return `已显示 ${state.words.length} / ${state.wordTotal} 个`
    },
    selectedLanguageLabel(state): string {
      const book = state.books.find((item) => item.id === state.selectedBookId)
      return displayLanguage(book?.language)
    },
    targetTermLabel(): string {
      return `${this.selectedLanguageLabel}词条`
    },
    explanationForItem: (state) => (itemId: string): string => {
      return state.studyExplanations[itemId] ?? ''
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
        this.resetBookDraft()
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
      this.phoneticStatus = ''
      await this.refreshSelectedBookData()
      this.resetBookDraft()
    },

    async refreshSelectedBookData() {
      if (!this.selectedBookId) {
        this.words = []
        this.wordTotal = 0
        this.overview = null
        return
      }
      const [wordsPayload, overview] = await Promise.all([
        fetchWords(this.selectedBookId, this.wordQuery, { limit: WORD_PAGE_SIZE, offset: 0 }),
        fetchOverview(this.selectedBookId),
      ])
      this.words = wordsPayload.words
      this.wordTotal = wordsPayload.total
      this.overview = overview
      this.books = await fetchBooks()
      if (!this.books.some((book) => book.id === this.selectedBookId)) {
        this.selectedBookId = this.books[0]?.id ?? ''
      }
      this.resetBookDraft()
    },

    resetBookDraft() {
      const book = this.selectedBook
      this.bookDraft = {
        name: book?.name ?? '',
        description: book?.description ?? '',
        language: displayLanguage(book?.language),
      }
    },

    async createBookDraft() {
      this.creatingBook = true
      this.error = ''

      try {
        const book = await createBook(this.newBookDraft)
        this.books = await fetchBooks()
        this.selectedBookId = book.id
        this.newBookDraft = { name: '', description: '', language: '英语' }
        this.wordQuery = ''
        await this.refreshSelectedBookData()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.creatingBook = false
      }
    },

    async saveBookDraft() {
      if (!this.selectedBookId) return
      this.savingBook = true
      this.error = ''

      try {
        await updateBook(this.selectedBookId, this.bookDraft)
        this.books = await fetchBooks()
        this.resetBookDraft()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.savingBook = false
      }
    },

    async deleteSelectedBook() {
      if (!this.selectedBookId) return
      this.deletingBook = true
      this.error = ''

      try {
        await deleteBook(this.selectedBookId)
        this.books = await fetchBooks()
        this.selectedBookId = this.books[0]?.id ?? ''
        this.wordQuery = ''
        this.resetWordDraft()
        await this.refreshSelectedBookData()
        this.resetBookDraft()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.deletingBook = false
      }
    },

    async exportSelectedBook() {
      if (!this.selectedBookId) return
      this.exportingBook = true
      this.error = ''

      try {
        const payload = await exportBookData(this.selectedBookId)
        const fileName = `${sanitizeFileName(payload.book.name || 'vocab')}-词库.json`
        downloadJson(fileName, payload)
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.exportingBook = false
      }
    },

    async searchWords(query: string) {
      this.wordQuery = query
      if (!this.selectedBookId) return
      const payload = await fetchWords(this.selectedBookId, query, { limit: WORD_PAGE_SIZE, offset: 0 })
      this.words = payload.words
      this.wordTotal = payload.total
    },

    async loadMoreWords() {
      if (!this.selectedBookId || this.loadingMoreWords || !this.hasMoreWords) return
      this.loadingMoreWords = true
      this.error = ''

      try {
        const payload = await fetchWords(this.selectedBookId, this.wordQuery, {
          limit: WORD_PAGE_SIZE,
          offset: this.words.length,
        })
        const existingIds = new Set(this.words.map((word) => word.id))
        this.words = [
          ...this.words,
          ...payload.words.filter((word) => !existingIds.has(word.id)),
        ]
        this.wordTotal = payload.total
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.loadingMoreWords = false
      }
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

    async generateMissingPhonetics(options: { bookId?: string; auto?: boolean } = {}) {
      const bookId = options.bookId ?? this.selectedBookId
      if (!bookId) return

      const toast = useToastStore()
      this.generatingPhonetics = true
      this.phoneticStatus = options.auto ? '导入完成，正在自动补全缺失读音...' : '正在生成缺失读音...'
      this.error = ''

      try {
        let totalRequested = 0
        let totalUpdated = 0
        let totalSkipped = 0
        let remainingCount = 0
        let stalled = false

        for (let batch = 0; batch < MAX_PHONETIC_BATCHES; batch += 1) {
          const result = await generateBookPhonetics(bookId, { limit: PHONETIC_BATCH_SIZE })
          totalRequested += result.requestedCount
          totalUpdated += result.updatedCount
          totalSkipped += result.skippedCount
          remainingCount = result.remainingCount

          if (result.requestedCount === 0 || result.remainingCount === 0) break

          if (result.updatedCount === 0) {
            stalled = true
            break
          }

          this.phoneticStatus = `正在生成读音：已补全 ${totalUpdated} 个，剩余 ${result.remainingCount} 个。`
        }

        if (totalRequested === 0) {
          this.phoneticStatus = '当前词库没有缺失读音的词条。'
          toast.info(this.phoneticStatus)
        } else if (remainingCount === 0) {
          this.phoneticStatus = `已补全 ${totalUpdated} 个读音，跳过 ${totalSkipped} 个。`
          toast.success(options.auto ? `导入完成，已自动补全 ${totalUpdated} 个读音。` : this.phoneticStatus)
        } else {
          this.phoneticStatus = `已补全 ${totalUpdated} 个读音，仍有 ${remainingCount} 个未补全。`
          toast.info(stalled ? `${this.phoneticStatus} 本批没有返回可用读音。` : this.phoneticStatus)
        }

        if (bookId === this.selectedBookId) {
          await this.refreshSelectedBookData()
        } else {
          this.books = await fetchBooks()
        }
      } catch (error) {
        this.error = errorMessage(error)
        toast.error(this.error)
      } finally {
        this.generatingPhonetics = false
      }
    },

    async repairSelectedBookWithAi(options: { bookId?: string } = {}) {
      const bookId = options.bookId ?? this.selectedBookId
      if (!bookId) return

      const toast = useToastStore()
      this.repairingWords = true
      this.repairStatus = '正在检查词库缺失字段...'
      this.phoneticStatus = ''
      this.error = ''

      try {
        let totalRequested = 0
        let totalUpdated = 0
        let totalSkipped = 0
        let remainingCount = 0
        let stalled = false

        for (let batch = 0; batch < MAX_REPAIR_BATCHES; batch += 1) {
          const result = await repairBookWords(bookId, { limit: REPAIR_BATCH_SIZE })
          totalRequested += result.requestedCount
          totalUpdated += result.updatedCount
          totalSkipped += result.skippedCount
          remainingCount = result.remainingCount

          if (result.requestedCount === 0 || result.remainingCount === 0) break

          if (result.updatedCount === 0 && result.skippedCount === 0) {
            stalled = true
            break
          }

          this.repairStatus = `正在修复词库：已修复 ${totalUpdated} 个，剩余 ${result.remainingCount} 个。`
        }

        if (totalRequested === 0) {
          this.repairStatus = '当前词库没有需要 AI 修复的缺失字段。'
          toast.info(this.repairStatus)
        } else if (remainingCount === 0) {
          this.repairStatus = `已修复 ${totalUpdated} 个词条，跳过 ${totalSkipped} 个。`
          toast.success(this.repairStatus)
        } else {
          this.repairStatus = `已修复 ${totalUpdated} 个词条，仍有 ${remainingCount} 个待修复。`
          toast.info(stalled ? `${this.repairStatus} 本批没有返回可用修复。` : this.repairStatus)
        }

        if (bookId === this.selectedBookId) {
          await this.refreshSelectedBookData()
        } else {
          this.books = await fetchBooks()
        }
      } catch (error) {
        this.error = errorMessage(error)
        toast.error(this.error)
      } finally {
        this.repairingWords = false
      }
    },

    async repairSelectedBookWithAiJob(options: { bookId?: string } = {}) {
      const bookId = options.bookId ?? this.selectedBookId
      if (!bookId) return

      const toast = useToastStore()
      this.repairingWords = true
      this.repairStatus = '正在创建 AI 质检任务...'
      this.phoneticStatus = ''
      this.error = ''

      try {
        const { job } = await createAiJob({ type: 'repair_words', payload: { bookId } })

        await subscribeAiJobEvents(job.id, {
          onStart: (event) => {
            this.repairStatus = `AI 质检任务已启动，并发 ${event.dynamicConcurrency ?? 16}，正在扫描词库。`
          },
          onProgress: (event) => {
            const repaired = event.repairedCount ?? event.generatedCount ?? 0
            const remaining = event.remainingCount ?? 0
            this.repairStatus = `正在并发修复：已修复 ${repaired} 个，剩余 ${remaining} 个；运行中 ${event.activeRequests ?? 0} 个请求。`
          },
          onRetry: (event) => {
            this.repairStatus = `DeepSeek 响应较慢，已自动降速重试；当前并发 ${event.dynamicConcurrency ?? 1}。`
          },
          onBatch: (event) => {
            const updatedWords = event.words as unknown as WordEntry[]
            this.replaceVisibleWords(updatedWords)
            const repaired = event.repairedCount ?? event.generatedCount ?? updatedWords.length
            const remaining = event.remainingCount ?? 0
            this.repairStatus = `刚追加修复 ${updatedWords.length} 个词条；累计 ${repaired} 个，剩余 ${remaining} 个。`
          },
          onDone: (event) => {
            const repaired = event.repairedCount ?? event.generatedCount ?? 0
            this.repairStatus = event.status === 'canceled'
              ? `AI 质检已取消，已保留 ${repaired} 个修复结果。`
              : `AI 质检完成，已修复 ${repaired} 个词条。`
          },
        })

        if (bookId === this.selectedBookId) {
          await this.refreshSelectedBookData()
        } else {
          this.books = await fetchBooks()
        }
        toast.success(this.repairStatus)
      } catch (error) {
        this.error = errorMessage(error)
        toast.error(this.error)
      } finally {
        this.repairingWords = false
      }
    },

    replaceVisibleWords(updatedWords: WordEntry[]) {
      if (!updatedWords.length) return
      const byId = new Map(updatedWords.map((word) => [word.id, word]))
      this.words = this.words.map((word) => byId.get(word.id) ?? word)
      this.books = this.books.map((book) => (
        book.id === this.selectedBookId
          ? { ...book, updatedAt: Date.now() }
          : book
      ))
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
        this.studyExplanations = {}
        this.explanationsError = ''
        this.unlockTo(2)
        void this.prefetchStudyExplanations()
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
      const canSubmitBlank = item?.mode === 'spelling'
      if (!this.session || !item || this.currentResult || (!canSubmitBlank && !this.currentAnswer.trim())) return
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

    async prefetchStudyExplanations() {
      if (!this.session || !this.studyItems.length) return
      const sessionId = this.session.id
      const items = this.studyItems.slice(0, 50)
      this.explanationsLoading = true
      this.explanationsError = ''

      try {
        const payload = await requestStudyExplanations(sessionId, items)
        if (this.session?.id !== sessionId) return
        if (payload.skipped) return

        this.studyExplanations = payload.explanations.reduce<Record<string, string>>((acc, item) => {
          acc[item.itemId] = item.explanation
          return acc
        }, {})
      } catch (error) {
        if (this.session?.id === sessionId) {
          this.explanationsError = errorMessage(error)
        }
      } finally {
        if (this.session?.id === sessionId) {
          this.explanationsLoading = false
        }
      }
    },
  },
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败'
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, ' ')
  return cleaned || 'vocab'
}

function displayLanguage(language?: string): string {
  const value = language?.trim()
  if (!value) return '自定义语言'
  if (value === 'en') return '英语'
  return value
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
