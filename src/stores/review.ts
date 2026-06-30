import { defineStore } from 'pinia'
import type {
  Attempt,
  GradedQuestion,
  ImportedText,
  OcrBox,
  ParsedQuestion,
  QuestionOption,
  QuestionType,
  ReviewMode,
  StudySet,
  UserAnswer,
} from '../types'
import {
  clearStudySets,
  deleteStudyAssets,
  listStudyAssets,
  listReviewStats,
  saveAttempt,
  saveStudyAssets,
  saveStudySet,
  listStudySets,
  recordReviewStats,
} from '../services/db/indexedDb'
import { gradeQuiz, summarizeScore } from '../services/grading/grader'
import { rescanPageWithBrowserOcr } from '../services/importers/browserOcr'
import { importStudyFile } from '../services/importers/fileImporter'
import { buildQuestionsFromImport, buildQuestionsFromOcrPages } from '../services/importers/importedQuestions'
import { importedAssetsToStudyAssets } from '../services/importers/ocrVisuals'
import { createManualVisualQuestion } from '../services/questions/manualVisualQuestion'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'
import { buildQuizSession } from '../services/quiz/session'
import {
  clampBox,
  cloneStudySet,
  createId,
  mergeOcrPages,
  nextOptionLabel,
} from './reviewHelpers'
import * as reviewGetters from './reviewGetters'
import { createReviewState } from './reviewState'

let ocrPollTimer: ReturnType<typeof setTimeout> | null = null

export const useReviewStore = defineStore('review', {
  state: createReviewState,

  getters: {
    enabledQuestions(state): ParsedQuestion[] {
      return reviewGetters.enabledQuestions(state)
    },
    totalAvailable(state): number {
      return reviewGetters.totalAvailable(state)
    },
    reviewQueueCount(state): number {
      return reviewGetters.reviewQueueCount(state)
    },
    availableQuizQuestions(state): ParsedQuestion[] {
      return reviewGetters.availableQuizQuestions(state)
    },
    answeredCount(state): number {
      return reviewGetters.answeredCount(state)
    },
    score(state): number {
      return reviewGetters.score(state)
    },
    filteredResults(state): GradedQuestion[] {
      return reviewGetters.filteredResults(state)
    },
  },

  actions: {
    async init() {
      this.recentSets = await listStudySets()
    },

    goTo(index: number) {
      if (index < 0 || index > this.unlockedIndex) return
      this.slideIndex = index
    },

    unlockTo(index: number) {
      this.unlockedIndex = Math.max(this.unlockedIndex, index)
      this.slideIndex = index
    },

    async importFile(file: File) {
      this.importing = true
      this.error = ''
      this.browserOcrDraft = null
      this.browserOcrMessage = ''

      try {
        const imported = await importStudyFile(file, { textOcrEnabled: this.textOcrEnabled })
        const questions = buildQuestionsFromImport(imported)
        const now = Date.now()
        const id = createId('set')

        this.currentSet = {
          id,
          title: imported.title,
          sourceFile: imported.sourceFile,
          questions,
          ocr: imported.ocr
            ? {
              enabled: true,
              mode: imported.ocr.mode,
              sourceKind: imported.ocr.sourceKind,
              jobId: imported.ocr.jobId,
              status: imported.ocr.status,
              processedPages: imported.ocr.processedPages,
              totalPages: imported.ocr.totalPages,
              error: imported.ocr.error,
              pages: imported.ocr.pages,
            }
            : undefined,
          createdAt: now,
          updatedAt: now,
        }
        this.reviewStats = []
        this.replaceAssetUrls({})

        if (imported.ocr?.assets.length) {
          await deleteStudyAssets(id)
          await saveStudyAssets(importedAssetsToStudyAssets(imported.ocr.assets, id, now))
          await this.loadAssetUrls(id)
        }

        await saveStudySet(this.currentSet)
        this.recentSets = await listStudySets()
        this.quizConfig.reviewMode = 'random'
        this.quizConfig.count = Math.min(20, Math.max(1, questions.length))
        this.unlockTo(1)
        if (imported.ocr?.jobId && imported.ocr.status === 'processing') {
          this.startOcrPolling(imported.ocr.jobId)
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : '导入失败'
      } finally {
        this.importing = false
      }
    },

    async loadStudySet(studySet: StudySet) {
      this.currentSet = cloneStudySet(studySet)
      this.quizConfig.count = Math.min(20, Math.max(1, studySet.questions.length))
      this.unlockTo(1)
      this.reviewStats = await listReviewStats(studySet.id)
      await this.loadAssetUrls(studySet.id)
      this.clampQuizCount()
    },

    async clearRecentSets() {
      await clearStudySets()
      this.stopOcrPolling()
      this.recentSets = []
      this.currentSet = null
      this.replaceAssetUrls({})
      this.reviewStats = []
      this.quizQuestions = []
      this.answers = {}
      this.results = []
      this.resultFilter = 'all'
      this.showStandardAnswers = false
      this.browserOcrDraft = null
      this.browserOcrMessage = ''
      this.slideIndex = 0
      this.unlockedIndex = 0
    },

    updateQuestion(id: string, patch: Partial<ParsedQuestion>) {
      const question = this.currentSet?.questions.find((item) => item.id === id)
      if (!question) return
      Object.assign(question, patch)
      if (patch.enabled !== undefined && patch.enabled) {
        question.ignored = false
        question.ocrReviewState = question.ocrReviewState === 'ignored' ? 'needs_review' : question.ocrReviewState
      }
      question.confidence = Math.max(question.confidence, 0.7)
      this.touchCurrentSet()
    },

    updateQuestionVisual(id: string, box: OcrBox) {
      const question = this.currentSet?.questions.find((item) => item.id === id)
      if (!question?.visual) return
      question.visual = {
        ...question.visual,
        source: 'manual',
        box: clampBox(box),
        engine: 'manual',
      }
      question.confidence = Math.max(question.confidence, 0.75)
      question.ocrReviewState = question.ignored ? 'ignored' : 'needs_review'
      this.touchCurrentSet()
    },

    addManualQuestionBox(pageNumber: number, box: OcrBox): string {
      if (!this.currentSet?.ocr) return ''
      const page = this.currentSet.ocr.pages.find((item) => item.pageNumber === pageNumber)
      if (!page) return ''

      const questions = this.currentSet.questions
      const pageQuestions = questions.filter((question) => question.visual?.pageNumber === pageNumber)
      const id = createId('q_manual')
      const question = createManualVisualQuestion(id, page, clampBox(box), pageQuestions.length + 1)

      const lastPageQuestionIndex = questions.reduce((lastIndex, item, index) => (
        item.visual?.pageNumber === pageNumber ? index : lastIndex
      ), -1)
      questions.splice(lastPageQuestionIndex + 1 || questions.length, 0, question)

      page.candidateCount = questions.filter((item) => item.visual?.pageNumber === pageNumber && !item.ignored).length
      page.pageReviewState = 'confirmed'
      this.touchCurrentSet()
      this.clampQuizCount()
      return id
    },

    setQuestionIgnored(id: string, ignored: boolean) {
      const question = this.currentSet?.questions.find((item) => item.id === id)
      if (!question) return
      question.ignored = ignored
      question.enabled = !ignored
      question.ocrReviewState = ignored ? 'ignored' : 'needs_review'
      this.touchCurrentSet()
      this.clampQuizCount()
    },

    setPageIgnored(pageNumber: number, ignored: boolean) {
      const questions = this.currentSet?.questions.filter((question) => question.visual?.pageNumber === pageNumber)
      if (!questions?.length) return
      questions.forEach((question) => {
        question.ignored = ignored
        question.enabled = !ignored
        question.ocrReviewState = ignored ? 'ignored' : 'needs_review'
      })

      const page = this.currentSet?.ocr?.pages.find((item) => item.pageNumber === pageNumber)
      if (page) {
        page.pageReviewState = ignored ? 'ignored' : 'needs_review'
      }

      this.touchCurrentSet()
      this.clampQuizCount()
    },

    updateOption(questionId: string, optionIndex: number, patch: Partial<QuestionOption>) {
      const question = this.currentSet?.questions.find((item) => item.id === questionId)
      const option = question?.options[optionIndex]
      if (!option) return
      Object.assign(option, patch)
      this.touchCurrentSet()
    },

    addOption(questionId: string) {
      const question = this.currentSet?.questions.find((item) => item.id === questionId)
      if (!question) return
      question.options.push({ label: nextOptionLabel(question.options), text: '' })
      this.touchCurrentSet()
    },

    removeOption(questionId: string, optionIndex: number) {
      const question = this.currentSet?.questions.find((item) => item.id === questionId)
      if (!question) return
      question.options.splice(optionIndex, 1)
      this.touchCurrentSet()
    },

    splitQuestion(id: string) {
      const questions = this.currentSet?.questions
      if (!questions) return

      const index = questions.findIndex((question) => question.id === id)
      const question = questions[index]
      if (!question) return

      const pieces = question.answer.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
      if (pieces.length < 2) return

      question.answer = pieces[0]
      questions.splice(index + 1, 0, {
        ...structuredClone(question),
        id: createId('q'),
        answer: pieces.slice(1).join('\n\n'),
        raw: pieces.slice(1).join('\n\n'),
        confidence: 0.55,
        warnings: ['由拆分生成，请检查题干和答案'],
      })
      this.touchCurrentSet()
    },

    mergeWithNext(id: string) {
      const questions = this.currentSet?.questions
      if (!questions) return

      const index = questions.findIndex((question) => question.id === id)
      const current = questions[index]
      const next = questions[index + 1]
      if (!current || !next) return

      current.answer = [current.answer, next.answer].filter(Boolean).join('\n\n')
      current.raw = [current.raw, next.raw].filter(Boolean).join('\n\n')
      current.warnings = Array.from(new Set([...current.warnings, '已与下一题合并']))
      questions.splice(index + 1, 1)
      this.touchCurrentSet()
    },

    moveQuestion(id: string, targetIndex: number) {
      const questions = this.currentSet?.questions
      if (!questions) return

      const fromIndex = questions.findIndex((question) => question.id === id)
      if (fromIndex < 0) return

      const [question] = questions.splice(fromIndex, 1)
      const nextIndex = Math.max(0, Math.min(targetIndex, questions.length))
      questions.splice(nextIndex, 0, question)
      this.touchCurrentSet()
    },

    setAllQuestionsEnabled(enabled: boolean) {
      const questions = this.currentSet?.questions
      if (!questions) return
      questions.forEach((question) => {
        question.enabled = enabled && !question.ignored
      })
      this.touchCurrentSet()
    },

    disableLowConfidence(threshold = 0.65) {
      const questions = this.currentSet?.questions
      if (!questions) return
      questions.forEach((question) => {
        if (question.confidence < threshold) {
          question.enabled = false
          question.ignored = true
          question.ocrReviewState = 'ignored'
        }
      })
      this.touchCurrentSet()
    },

    setMissingAnswerType(type: QuestionType) {
      const questions = this.currentSet?.questions
      if (!questions) return
      questions.forEach((question) => {
        if (!question.answer.trim()) {
          question.type = type
          question.confidence = Math.max(question.confidence, 0.7)
        }
      })
      this.touchCurrentSet()
    },

    async saveCurrentSet() {
      if (!this.currentSet) return
      this.currentSet.updatedAt = Date.now()
      await saveStudySet(this.currentSet)
      this.recentSets = await listStudySets()
    },

    startOcrPolling(jobId: string) {
      this.stopOcrPolling()
      this.ocrPolling = true

      const tick = async () => {
        const done = await this.pollOcrJob(jobId).catch((error: unknown) => {
          if (this.currentSet?.ocr?.jobId === jobId) {
            this.currentSet.ocr.status = 'failed'
            this.currentSet.ocr.error = error instanceof Error ? error.message : 'OCR 轮询失败'
            this.touchCurrentSet()
          }
          return true
        })

        if (done || this.currentSet?.ocr?.jobId !== jobId) {
          this.ocrPolling = false
          ocrPollTimer = null
          return
        }

        ocrPollTimer = setTimeout(tick, 1400)
      }

      ocrPollTimer = setTimeout(tick, 650)
    },

    stopOcrPolling() {
      if (ocrPollTimer) {
        clearTimeout(ocrPollTimer)
        ocrPollTimer = null
      }
      this.ocrPolling = false
    },

    async pollOcrJob(jobId: string): Promise<boolean> {
      if (!this.currentSet?.ocr || this.currentSet.ocr.jobId !== jobId) return true

      const afterPage = this.currentSet.ocr.processedPages ?? 0
      const response = await fetch(`/api/ocr/jobs/${jobId}?afterPage=${afterPage}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null
        throw new Error(payload?.detail ?? 'OCR 轮询失败')
      }

      const imported = await response.json() as ImportedText
      await this.mergeOcrUpdate(imported)
      return imported.ocr?.status !== 'processing'
    },

    async mergeOcrUpdate(imported: ImportedText) {
      if (!this.currentSet?.ocr || !imported.ocr) return

      const existingPages = this.currentSet.ocr.pages
      const newlyRecognizedPages = imported.ocr.pages.filter((page) => {
        if (!page.lines.length) return false
        const existing = existingPages.find((item) => item.pageNumber === page.pageNumber)
        return !existing || existing.lines.length === 0
      })

      this.currentSet.ocr = {
        ...this.currentSet.ocr,
        jobId: imported.ocr.jobId ?? this.currentSet.ocr.jobId,
        status: imported.ocr.status,
        processedPages: imported.ocr.processedPages,
        totalPages: imported.ocr.totalPages,
        error: imported.ocr.error,
        pages: mergeOcrPages(existingPages, imported.ocr.pages),
      }

      if (imported.ocr.assets.length) {
        await saveStudyAssets(importedAssetsToStudyAssets(imported.ocr.assets, this.currentSet.id, Date.now()))
        await this.loadAssetUrls(this.currentSet.id)
      }

      if (newlyRecognizedPages.length) {
        const questions = buildQuestionsFromOcrPages(newlyRecognizedPages, 'ocr')
        this.currentSet.questions.push(...questions)
        this.quizConfig.count = Math.min(20, Math.max(1, this.enabledQuestions.length))
      }

      this.touchCurrentSet()
      await this.saveCurrentSet()
    },

    async requestBrowserRescan(pageNumber: number) {
      if (!this.currentSet?.ocr) return
      const page = this.currentSet.ocr.pages.find((item) => item.pageNumber === pageNumber)
      if (!page) return
      const assetUrl = this.assetUrls[page.assetId]
      if (!assetUrl) {
        this.browserOcrMessage = '当前页图像尚未加载，稍后再试。'
        return
      }

      this.browserOcrBusy = true
      this.browserOcrMessage = '正在准备浏览器 OCR 重扫...'
      this.browserOcrDraft = null

      try {
        const draft = await rescanPageWithBrowserOcr(page, assetUrl)
        this.browserOcrDraft = {
          ...draft,
          engine: 'browser_onnx',
          pageReviewState: draft.pageReviewState ?? 'needs_review',
        }
        this.browserOcrMessage = `浏览器 OCR 已生成第 ${pageNumber} 页结果，确认后可采用。`
      } catch (error) {
        this.browserOcrMessage = error instanceof Error ? error.message : '浏览器 OCR 重扫失败。'
      } finally {
        this.browserOcrBusy = false
      }
    },

    async adoptBrowserOcrDraft() {
      if (!this.currentSet?.ocr || !this.browserOcrDraft) return
      const draft = this.browserOcrDraft
      this.currentSet.ocr.pages = mergeOcrPages(
        this.currentSet.ocr.pages.filter((page) => page.pageNumber !== draft.pageNumber),
        [draft],
      )
      this.currentSet.questions = [
        ...this.currentSet.questions.filter((question) => question.visual?.pageNumber !== draft.pageNumber),
        ...buildQuestionsFromOcrPages([draft], 'ocr'),
      ]
      this.browserOcrDraft = null
      this.browserOcrMessage = `已采用第 ${draft.pageNumber} 页的浏览器 OCR 结果。`
      this.quizConfig.count = Math.min(20, Math.max(1, this.enabledQuestions.length))
      this.touchCurrentSet()
      await this.saveCurrentSet()
    },

    async loadAssetUrls(studySetId: string) {
      const assets = await listStudyAssets(studySetId)
      const urls = typeof URL.createObjectURL === 'function'
        ? Object.fromEntries(assets.map((asset) => [asset.id, URL.createObjectURL(asset.blob)]))
        : {}
      this.replaceAssetUrls(urls)
    },

    replaceAssetUrls(urls: Record<string, string>) {
      if (typeof URL.revokeObjectURL === 'function') {
        Object.values(this.assetUrls).forEach((url) => URL.revokeObjectURL(url))
      }
      this.assetUrls = urls
    },

    async finishPreview() {
      await this.saveCurrentSet()
      this.unlockTo(2)
    },

    setTypeEnabled(type: QuestionType, enabled: boolean) {
      if (enabled && !this.quizConfig.types.includes(type)) {
        this.quizConfig.types.push(type)
      }

      if (!enabled) {
        this.quizConfig.types = this.quizConfig.types.filter((item) => item !== type)
      }

      this.clampQuizCount()
    },

    setReviewMode(mode: ReviewMode) {
      this.quizConfig.reviewMode = mode
      this.clampQuizCount()
    },

    clampQuizCount() {
      const max = this.availableQuizQuestions.length
      if (max <= 0) return
      this.quizConfig.count = Math.max(1, Math.min(this.quizConfig.count, max))
    },

    startQuiz() {
      if (!this.currentSet) return
      this.clampQuizCount()
      const quizQuestions = buildQuizSession(this.currentSet.questions, this.quizConfig, this.reviewStats)
      if (!quizQuestions.length) return
      this.quizQuestions = quizQuestions
      this.answers = {}
      this.results = []
      this.resultFilter = 'all'
      this.showStandardAnswers = false
      this.activeQuestionIndex = 0
      this.unlockTo(3)
    },

    setAnswer(questionId: string, value: string | string[]) {
      this.answers[questionId] = value
    },

    nextQuestion() {
      this.activeQuestionIndex = Math.min(this.activeQuestionIndex + 1, this.quizQuestions.length - 1)
    },

    previousQuestion() {
      this.activeQuestionIndex = Math.max(this.activeQuestionIndex - 1, 0)
    },

    async submitQuiz() {
      if (!this.currentSet) return
      const createdAt = Date.now()
      const answers = Object.entries(this.answers).map<UserAnswer>(([questionId, value]) => ({
        questionId,
        value,
      }))
      this.results = gradeQuiz(this.quizQuestions, answers)
      this.resultFilter = 'all'
      this.showStandardAnswers = false

      const attempt: Attempt = {
        id: createId('attempt'),
        studySetId: this.currentSet.id,
        answers,
        results: this.results,
        score: summarizeScore(this.results),
        createdAt,
      }

      await saveAttempt(attempt)
      await recordReviewStats(this.currentSet.id, this.results, createdAt)
      this.reviewStats = await listReviewStats(this.currentSet.id)
      this.unlockTo(4)
    },

    selfAssessResult(questionId: string, status: 'correct' | 'review' | 'wrong') {
      const result = this.results.find((item) => item.question.id === questionId)
      if (!result || !isVisualOnlyQuestion(result.question)) return

      result.status = status
      result.score = status === 'correct' ? 1 : 0
      result.detail = status === 'correct'
        ? '已标记为掌握'
        : status === 'wrong'
          ? '已标记为未掌握'
          : '保留为待复习'
    },

    restartRandom() {
      this.startQuiz()
    },

    resetToImport() {
      this.stopOcrPolling()
      this.browserOcrDraft = null
      this.browserOcrMessage = ''
      this.slideIndex = 0
      this.unlockedIndex = Math.max(this.unlockedIndex, 0)
    },

    touchCurrentSet() {
      if (!this.currentSet) return
      this.currentSet.updatedAt = Date.now()
    },
  },
})
