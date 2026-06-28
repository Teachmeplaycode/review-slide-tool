import { defineStore } from 'pinia'
import type {
  Attempt,
  GradedQuestion,
  ParsedQuestion,
  QuestionOption,
  QuestionType,
  QuizConfig,
  QuizQuestion,
  ResultFilter,
  StudySet,
  UserAnswer,
} from '../types'
import { saveAttempt, saveStudySet, listStudySets } from '../services/db/indexedDb'
import { gradeQuiz, summarizeScore } from '../services/grading/grader'
import { importStudyFile } from '../services/importers/fileImporter'
import { parseQuestions } from '../services/parser/questionParser'
import { buildQuizSession } from '../services/quiz/session'

type ReviewState = {
  slideIndex: number
  unlockedIndex: number
  recentSets: StudySet[]
  currentSet: StudySet | null
  quizConfig: QuizConfig
  quizQuestions: QuizQuestion[]
  activeQuestionIndex: number
  answers: Record<string, string | string[]>
  results: GradedQuestion[]
  resultFilter: ResultFilter
  showStandardAnswers: boolean
  importing: boolean
  error: string
}

export const useReviewStore = defineStore('review', {
  state: (): ReviewState => ({
    slideIndex: 0,
    unlockedIndex: 0,
    recentSets: [],
    currentSet: null,
    quizConfig: {
      count: 20,
      types: ['choice', 'true_false', 'blank', 'short'],
      enableCloze: true,
      clozeRatio: 0.3,
    },
    quizQuestions: [],
    activeQuestionIndex: 0,
    answers: {},
    results: [],
    resultFilter: 'all',
    showStandardAnswers: false,
    importing: false,
    error: '',
  }),

  getters: {
    enabledQuestions(state): ParsedQuestion[] {
      return state.currentSet?.questions.filter((question) => question.enabled) ?? []
    },
    totalAvailable(state): number {
      return state.currentSet?.questions.filter((question) => question.enabled).length ?? 0
    },
    answeredCount(state): number {
      return state.quizQuestions.filter((question) => hasAnswer(state.answers[question.id])).length
    },
    score(state): number {
      return summarizeScore(state.results)
    },
    filteredResults(state): GradedQuestion[] {
      if (state.resultFilter === 'all') return state.results
      if (state.resultFilter === 'wrong') {
        return state.results.filter((result) => result.status !== 'correct')
      }
      return state.results.filter((result) => result.status === state.resultFilter)
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

      try {
        const imported = await importStudyFile(file)
        const questions = parseQuestions(imported.text)
        const now = Date.now()

        this.currentSet = {
          id: createId('set'),
          title: imported.title,
          sourceFile: imported.sourceFile,
          questions,
          createdAt: now,
          updatedAt: now,
        }

        await saveStudySet(this.currentSet)
        this.recentSets = await listStudySets()
        this.quizConfig.count = Math.min(20, Math.max(1, questions.length))
        this.unlockTo(1)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '导入失败'
      } finally {
        this.importing = false
      }
    },

    async loadStudySet(studySet: StudySet) {
      this.currentSet = structuredClone(studySet)
      this.quizConfig.count = Math.min(20, Math.max(1, studySet.questions.length))
      this.unlockTo(1)
    },

    updateQuestion(id: string, patch: Partial<ParsedQuestion>) {
      const question = this.currentSet?.questions.find((item) => item.id === id)
      if (!question) return
      Object.assign(question, patch)
      question.confidence = Math.max(question.confidence, 0.7)
      this.touchCurrentSet()
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

    async saveCurrentSet() {
      if (!this.currentSet) return
      this.currentSet.updatedAt = Date.now()
      await saveStudySet(this.currentSet)
      this.recentSets = await listStudySets()
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
    },

    startQuiz() {
      if (!this.currentSet) return
      this.quizQuestions = buildQuizSession(this.currentSet.questions, this.quizConfig)
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
        createdAt: Date.now(),
      }

      await saveAttempt(attempt)
      this.unlockTo(4)
    },

    restartRandom() {
      this.startQuiz()
    },

    resetToImport() {
      this.slideIndex = 0
      this.unlockedIndex = Math.max(this.unlockedIndex, 0)
    },

    touchCurrentSet() {
      if (!this.currentSet) return
      this.currentSet.updatedAt = Date.now()
    },
  },
})

function hasAnswer(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0)
  return Boolean(value?.trim())
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function nextOptionLabel(options: QuestionOption[]): string {
  const used = new Set(options.map((option) => option.label.toUpperCase()))
  const labels = 'ABCDEFGH'.split('')
  return labels.find((label) => !used.has(label)) ?? String(options.length + 1)
}
