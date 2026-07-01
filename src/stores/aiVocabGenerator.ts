import { defineStore } from 'pinia'
import type {
  AiVocabChatMessage,
  AiVocabConversationPlan,
  AiVocabDraft,
  AiVocabGenerationMode,
  AiVocabLevel,
  AiVocabProfile,
  AiVocabResearchSource,
  ImportTargetMode,
  VocabImportResult,
  WordDraft,
} from '../types'
import {
  commitAiVocabDraft,
  planAiVocabConversation,
  researchAiVocabContext,
  streamAiVocabDraft,
} from '../services/api/aiVocabApi'
import { useToastStore } from './toast'
import { useVocabStore } from './vocab'

type AiVocabGeneratorState = {
  generationMode: AiVocabGenerationMode
  language: string
  topic: string
  level: AiVocabLevel
  scenario: string
  wordCount: number
  bookName: string
  chatMessages: AiVocabChatMessage[]
  chatInput: string
  chatPlanning: boolean
  chatPlan: AiVocabConversationPlan | null
  retrievalEnabled: boolean
  researching: boolean
  researchQuery: string
  researchAnswer: string
  researchSources: AiVocabResearchSource[]
  researchWarning: string
  draft: AiVocabDraft | null
  selectedKeys: string[]
  targetMode: ImportTargetMode
  requestedCount: number
  generatedBatches: number
  totalBatches: number
  currentBatch: number
  requestedBatchSize: number
  batchRetrying: boolean
  lastBatchSize: number
  result: VocabImportResult | null
  generating: boolean
  saving: boolean
  error: string
}

type AiVocabGenerationProfile = Pick<AiVocabProfile, 'language' | 'topic' | 'level' | 'scenario' | 'wordCount' | 'bookName'>

const DEFAULT_LEVEL: AiVocabLevel = '初级'
const MAX_WORD_COUNT = 5000
const FIRST_BATCH_SIZE = 10
const NEXT_BATCH_SIZE = 10
const MIN_TOPIC_LENGTH = 2
const LEVELS: AiVocabLevel[] = ['入门', '初级', '中级', '高级', '专业']

export const useAiVocabGeneratorStore = defineStore('aiVocabGenerator', {
  state: (): AiVocabGeneratorState => ({
    generationMode: 'quick',
    language: '',
    topic: '',
    level: DEFAULT_LEVEL,
    scenario: '',
    wordCount: 20,
    bookName: '',
    chatMessages: [],
    chatInput: '',
    chatPlanning: false,
    chatPlan: null,
    retrievalEnabled: false,
    researching: false,
    researchQuery: '',
    researchAnswer: '',
    researchSources: [],
    researchWarning: '',
    draft: null,
    selectedKeys: [],
    targetMode: 'new_book',
    requestedCount: 0,
    generatedBatches: 0,
    totalBatches: 0,
    currentBatch: 0,
    requestedBatchSize: 0,
    batchRetrying: false,
    lastBatchSize: 0,
    result: null,
    generating: false,
    saving: false,
    error: '',
  }),

  getters: {
    canGenerate(state): boolean {
      return Boolean(state.language.trim()) && state.topic.trim().length >= MIN_TOPIC_LENGTH && !state.generating && !state.chatPlanning
    },
    canSendChat(state): boolean {
      return state.chatInput.trim().length >= 1 && !state.chatPlanning && !state.generating
    },
    generateBlockReason(state): string {
      if (state.generating) return ''
      if (state.chatPlanning) return 'AI 正在整理定制需求，完成后即可生成。'
      if (state.generationMode === 'chat' && (!state.language.trim() || state.topic.trim().length < MIN_TOPIC_LENGTH)) {
        return '先发送需求给 AI，确认需求摘要后再生成。'
      }
      if (!state.language.trim()) return '请先填写目标语言。'
      if (state.topic.trim().length < MIN_TOPIC_LENGTH) return `学习想法至少输入 ${MIN_TOPIC_LENGTH} 个字。`
      return ''
    },
    selectedWords(state): WordDraft[] {
      const selected = new Set(state.selectedKeys)
      return state.draft?.words.filter((word) => selected.has(wordKey(word))) ?? []
    },
    canSave(): boolean {
      return Boolean(this.draft) && this.selectedWords.length > 0 && !this.saving
    },
    effectiveBookName(state): string {
      return state.bookName.trim() || defaultBookName(state.language, state.topic)
    },
    generatedCount(state): number {
      return state.draft?.words.length ?? 0
    },
    generationLabel(state): string {
      if (!state.generating && !state.draft) return ''
      if (state.generating && state.researching) return '正在检索最新资料，检索完成后会继续生成词条。'
      const generated = state.draft?.words.length ?? 0
      const target = state.requestedCount || clampWordCount(state.wordCount)
      if (state.generating) {
        if (!state.currentBatch) return `正在连接生成流，准备分批生成 ${target} 个词条`
        const retryText = state.batchRetrying ? '，响应较慢正在重试' : ''
        return `正在请求第 ${state.currentBatch} / ${Math.max(1, state.totalBatches)} 批，每批 ${state.requestedBatchSize || NEXT_BATCH_SIZE} 个；已追加 ${generated} / ${target} 个${retryText}`
      }
      return `已生成 ${generated} / ${target} 个候选词条`
    },
    generationProgressPercent(state): string {
      const target = state.requestedCount || clampWordCount(state.wordCount)
      const generated = state.draft?.words.length ?? 0
      if (!target) return '0%'
      if (state.generating && !generated) return '4%'
      return `${Math.min(100, Math.max(0, Math.round((generated / target) * 100)))}%`
    },
    profilePreview(state): AiVocabGenerationProfile {
      return {
        language: state.language.trim(),
        topic: state.topic.trim(),
        level: state.level,
        scenario: state.scenario.trim(),
        wordCount: clampWordCount(state.wordCount),
        bookName: state.bookName.trim() || defaultBookName(state.language, state.topic),
      }
    },
  },

  actions: {
    setGenerationMode(mode: AiVocabGenerationMode) {
      this.generationMode = mode
      if (mode === 'quick') {
        this.retrievalEnabled = false
      }
    },

    async sendChatMessage() {
      if (!this.canSendChat) return

      const content = this.chatInput.trim()
      this.chatInput = ''
      this.error = ''
      this.chatPlanning = true
      this.chatMessages = [
        ...this.chatMessages,
        createChatMessage('user', content),
      ].slice(-20)

      try {
        const plan = await planAiVocabConversation({
          conversation: this.chatMessages,
          profile: this.profilePreview,
        })
        this.chatPlan = plan
        this.applyProfile(plan.profile)
        this.chatMessages = [
          ...this.chatMessages,
          createChatMessage('assistant', assistantPlanMessage(plan)),
        ].slice(-20)
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.chatPlanning = false
      }
    },

    async generateDraft() {
      if (!this.canGenerate) return

      this.generating = true
      this.error = ''
      this.researchWarning = ''
      this.researchQuery = ''
      this.researchAnswer = ''
      this.researchSources = []
      this.result = null
      this.draft = null
      this.selectedKeys = []
      this.requestedCount = clampWordCount(this.wordCount)
      this.generatedBatches = 0
      this.totalBatches = estimateBatchCount(this.requestedCount)
      this.currentBatch = 0
      this.requestedBatchSize = 0
      this.batchRetrying = false
      this.lastBatchSize = 0

      const profile = this.profilePreview

      try {
        const researchSources = await this.loadResearchIfNeeded(profile)

        await streamAiVocabDraft({
          ...profile,
          mode: this.generationMode,
          retrievalEnabled: this.generationMode === 'chat' && this.retrievalEnabled && researchSources.length > 0,
          conversation: this.generationMode === 'chat' ? this.chatMessages : [],
          researchSources,
        }, {
          onStart: (event) => {
            this.requestedCount = event.requestedCount
            this.generatedBatches = event.generatedBatches
            this.totalBatches = event.totalBatches
            this.currentBatch = event.totalBatches ? 1 : 0
            this.requestedBatchSize = Math.min(NEXT_BATCH_SIZE, event.requestedCount)
            this.batchRetrying = false
          },
          onProgress: (event) => {
            this.requestedCount = event.requestedCount
            this.generatedBatches = event.generatedBatches
            this.totalBatches = event.totalBatches
            this.currentBatch = event.currentBatch
            this.requestedBatchSize = event.requestedBatchSize
            this.batchRetrying = Boolean(event.retrying)
          },
          onBatch: (event) => {
            const nextWords = uniqueNewWords(this.draft?.words ?? [], event.words)

            if (!this.draft) {
              this.draft = {
                draftId: event.draftId,
                provider: event.provider,
                profile: event.profile ?? profile,
                words: [],
                createdAt: event.createdAt,
              }
            }

            if (nextWords.length) {
              this.draft.words = [...this.draft.words, ...nextWords].slice(0, this.requestedCount)
              this.selectedKeys = this.draft.words.map(wordKey)
            }

            this.lastBatchSize = nextWords.length
            this.generatedBatches = event.generatedBatches
            this.totalBatches = event.totalBatches
            this.currentBatch = Math.min(event.generatedBatches + 1, event.totalBatches)
            this.requestedBatchSize = event.requestedBatchSize || NEXT_BATCH_SIZE
            this.batchRetrying = false
          },
          onDone: (event) => {
            this.generatedBatches = event.generatedBatches
            this.totalBatches = event.totalBatches
            this.currentBatch = event.generatedBatches
            this.batchRetrying = false
          },
        })

        const currentDraft = this.draft as AiVocabDraft | null
        if (!currentDraft?.words.length) {
          throw new Error('AI 未返回有效词条')
        }

        if (this.generatedCount < this.requestedCount) {
          this.error = `已生成 ${this.generatedCount} 个候选，连续批次没有新增词条，已停止追加。`
        }
      } catch (error) {
        const currentDraft = this.draft as AiVocabDraft | null
        this.error = currentDraft?.words.length
          ? `已保留本次生成的 ${currentDraft.words.length} 个候选；后续批次失败：${errorMessage(error)}`
          : errorMessage(error)
      } finally {
        this.generating = false
        this.researching = false
      }
    },

    async loadResearchIfNeeded(profile: AiVocabGenerationProfile): Promise<AiVocabResearchSource[]> {
      if (this.generationMode !== 'chat' || !this.retrievalEnabled) return []

      this.researching = true
      try {
        const research = await researchAiVocabContext({
          profile,
          conversation: this.chatMessages,
          maxResults: 5,
        })
        this.researchQuery = research.query
        this.researchAnswer = research.answer
        this.researchSources = research.sources
        return research.sources
      } catch (error) {
        this.researchWarning = `检索失败，已改用用户输入生成：${errorMessage(error)}`
        return []
      } finally {
        this.researching = false
      }
    },

    applyProfile(profile: Partial<AiVocabProfile> = {}) {
      if (profile.language?.trim()) this.language = profile.language.trim()
      if (profile.topic?.trim()) this.topic = profile.topic.trim()
      if (profile.level && isAiVocabLevel(profile.level)) this.level = profile.level
      if (profile.scenario?.trim()) this.scenario = profile.scenario.trim()
      if (profile.bookName?.trim()) this.bookName = profile.bookName.trim()
      if (Number.isFinite(Number(profile.wordCount))) this.wordCount = clampWordCount(Number(profile.wordCount))
    },

    toggleWord(word: WordDraft) {
      const key = wordKey(word)
      if (this.selectedKeys.includes(key)) {
        this.selectedKeys = this.selectedKeys.filter((item) => item !== key)
      } else {
        this.selectedKeys.push(key)
      }
    },

    selectAllDraftWords() {
      this.selectedKeys = this.draft?.words.map(wordKey) ?? []
    },

    clearDraftSelection() {
      this.selectedKeys = []
    },

    async saveDraft() {
      if (!this.canSave || !this.draft) return

      this.saving = true
      this.error = ''

      try {
        const vocab = useVocabStore()
        this.result = await commitAiVocabDraft({
          targetMode: this.targetMode,
          bookId: this.targetMode === 'merge_current' ? vocab.selectedBookId : '',
          language: this.draft.profile.language,
          bookName: this.effectiveBookName,
          topic: this.draft.profile.topic,
          description: '',
          words: this.selectedWords,
        })
        await vocab.selectBook(this.result.book.id)
        useToastStore().success(`${this.targetMode === 'merge_current' ? '已合并' : '已保存'} ${this.result.importedCount} 个词条`)
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.saving = false
      }
    },

    clearChat() {
      this.chatMessages = []
      this.chatInput = ''
      this.chatPlan = null
      this.researchQuery = ''
      this.researchAnswer = ''
      this.researchSources = []
      this.researchWarning = ''
    },

    reset() {
      this.draft = null
      this.selectedKeys = []
      this.requestedCount = 0
      this.generatedBatches = 0
      this.totalBatches = 0
      this.currentBatch = 0
      this.requestedBatchSize = 0
      this.batchRetrying = false
      this.lastBatchSize = 0
      this.result = null
      this.error = ''
      this.researchWarning = ''
    },
  },
})

function createChatMessage(role: AiVocabChatMessage['role'], content: string): AiVocabChatMessage {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
  }
}

function assistantPlanMessage(plan: AiVocabConversationPlan): string {
  const questions = plan.questions.length
    ? `\n${plan.questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}`
    : ''
  return `${plan.message}${questions}`
}

function wordKey(word: WordDraft): string {
  return `${word.word}::${word.meaningZh}`
}

function defaultBookName(language: string, topic: string): string {
  const cleanLanguage = language.trim() || '自定义语言'
  const cleanTopic = topic.trim().replace(/\s+/g, ' ').slice(0, 18)
  return cleanTopic ? `${cleanLanguage}-${cleanTopic}词库` : `${cleanLanguage}学习词库`
}

function estimateBatchCount(total: number): number {
  if (total <= FIRST_BATCH_SIZE) return 1
  return 1 + Math.ceil((total - FIRST_BATCH_SIZE) / NEXT_BATCH_SIZE)
}

function uniqueNewWords(existing: WordDraft[], incoming: WordDraft[]): WordDraft[] {
  const seen = new Set(existing.map((word) => normalizeWordKey(word.word)))
  const accepted: WordDraft[] = []

  for (const word of incoming) {
    const key = normalizeWordKey(word.word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    accepted.push(word)
  }

  return accepted
}

function normalizeWordKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function clampWordCount(value: number): number {
  if (!Number.isFinite(value)) return 20
  return Math.max(5, Math.min(MAX_WORD_COUNT, Math.round(value)))
}

function isAiVocabLevel(level: string): level is AiVocabLevel {
  return LEVELS.includes(level as AiVocabLevel)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 生成失败'
}
