import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commitAiVocabDraft, planAiVocabConversation, researchAiVocabContext, streamAiVocabDraft } from '../services/api/aiVocabApi'
import { useAiVocabGeneratorStore } from './aiVocabGenerator'

const selectBookMock = vi.hoisted(() => vi.fn())

vi.mock('../services/api/aiVocabApi', () => ({
  commitAiVocabDraft: vi.fn(),
  planAiVocabConversation: vi.fn(),
  researchAiVocabContext: vi.fn(),
  streamAiVocabDraft: vi.fn(),
}))

vi.mock('./vocab', () => ({
  useVocabStore: () => ({
    selectedBookId: 'book_current',
    selectBook: selectBookMock,
  }),
}))

describe('ai vocab generator store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(commitAiVocabDraft).mockResolvedValue({
      job: {
        id: 'import_1',
        sourceFile: 'AI 生成：日本旅行点餐常用表达',
        targetBookId: 'book_jp',
        mode: 'new_book',
        provider: 'deepseek',
        status: 'success',
        rawTextLength: 0,
        importedCount: 1,
        skippedCount: 0,
        errorMessage: '',
        createdAt: 1,
      },
      book: {
        id: 'book_jp',
        name: '旅行日语',
        description: 'AI 生成',
        language: '日语',
        wordCount: 1,
        learnedCount: 0,
        reviewCount: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      importedCount: 1,
      skippedCount: 0,
      rawTextLength: 0,
      sourceFile: 'AI 生成：日本旅行点餐常用表达',
      provider: 'deepseek',
      usedAi: true,
      targetMode: 'new_book',
      previewWords: [],
    })
  })

  it('generates a selectable draft in batches and saves selected words as a new book', async () => {
    vi.mocked(streamAiVocabDraft).mockImplementationOnce(async (_payload, handlers) => {
      const streamHandlers = handlers ?? {}
      streamHandlers.onStart?.({
        requestedCount: 60,
        generatedCount: 0,
        generatedBatches: 0,
        totalBatches: 2,
      })
      streamHandlers.onBatch?.(streamBatch(makeWords(1, 50), 60, 50, 1, 2))
      streamHandlers.onBatch?.(streamBatch(makeWords(51, 10), 60, 60, 2, 2))
      streamHandlers.onDone?.({
        requestedCount: 60,
        generatedCount: 60,
        generatedBatches: 2,
        totalBatches: 2,
        stoppedReason: '',
      })
    })
    const store = useAiVocabGeneratorStore()
    store.language = '日语'
    store.topic = '日本旅行点餐常用表达'
    store.scenario = '旅行'
    store.bookName = '旅行日语'
    store.wordCount = 60

    await store.generateDraft()
    store.toggleWord(store.draft!.words[1])
    await store.saveDraft()

    expect(streamAiVocabDraft).toHaveBeenCalledWith({
      language: '日语',
      topic: '日本旅行点餐常用表达',
      level: '初级',
      scenario: '旅行',
      wordCount: 60,
      bookName: '旅行日语',
      mode: 'quick',
      retrievalEnabled: false,
      conversation: [],
      researchSources: [],
    }, expect.any(Object))
    expect(commitAiVocabDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetMode: 'new_book',
      bookId: '',
      language: '日语',
      bookName: '旅行日语',
      words: store.draft!.words.filter((_, index) => index !== 1),
    }))
    expect(selectBookMock).toHaveBeenCalledWith('book_jp')
  })

  it('turns advanced chat into a structured generation profile', async () => {
    vi.mocked(planAiVocabConversation).mockResolvedValueOnce({
      message: '已整理成英语社媒聊天词库。',
      questions: ['需要更偏 X 还是 Discord？'],
      ready: true,
      profile: {
        language: '英语',
        topic: 'X 和 Discord 上的网络聊天表达、缩写和热梗',
        level: '中级',
        scenario: '社媒聊天',
        wordCount: 80,
        bookName: '英语社媒聊天词库',
      },
    })
    const store = useAiVocabGeneratorStore()
    store.setGenerationMode('chat')
    store.chatInput = '我想和外网朋友聊天，包含 X/Discord 的热梗和缩写'

    await store.sendChatMessage()

    expect(planAiVocabConversation).toHaveBeenCalledWith(expect.objectContaining({
      conversation: [expect.objectContaining({ role: 'user' })],
    }))
    expect(store.language).toBe('英语')
    expect(store.level).toBe('中级')
    expect(store.wordCount).toBe(80)
    expect(store.chatMessages.at(-1)?.role).toBe('assistant')
  })

  it('allows concise topics generated from chat answers', () => {
    const store = useAiVocabGeneratorStore()

    store.language = '英语'
    store.topic = '考研英语'

    expect(store.canGenerate).toBe(true)
    expect(store.generateBlockReason).toBe('')
  })

  it('uses chat-specific guidance before advanced profile is ready', () => {
    const store = useAiVocabGeneratorStore()

    store.setGenerationMode('chat')

    expect(store.canGenerate).toBe(false)
    expect(store.generateBlockReason).toBe('先发送需求给 AI，确认需求摘要后再生成。')
  })

  it('shows batch progress before the first words return', async () => {
    let finishStream!: () => void
    vi.mocked(streamAiVocabDraft).mockImplementationOnce(async (_payload, handlers) => {
      handlers?.onStart?.({
        requestedCount: 20,
        generatedCount: 0,
        generatedBatches: 0,
        totalBatches: 2,
      })
      handlers?.onProgress?.({
        requestedCount: 20,
        generatedCount: 0,
        generatedBatches: 0,
        totalBatches: 2,
        currentBatch: 1,
        requestedBatchSize: 10,
        retrying: false,
      })
      await new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })
    const store = useAiVocabGeneratorStore()
    store.language = '英语'
    store.topic = '考研英语'
    store.wordCount = 20

    const generation = store.generateDraft()

    await vi.waitFor(() => {
      expect(store.currentBatch).toBe(1)
    })
    expect(store.generating).toBe(true)
    expect(store.requestedBatchSize).toBe(10)
    expect(store.generationLabel).toContain('第 1 / 2 批')
    expect(store.generationProgressPercent).toBe('4%')

    finishStream()
    await generation
  })

  it('keeps generating when optional retrieval fails', async () => {
    vi.mocked(researchAiVocabContext).mockRejectedValueOnce(new Error('Tavily timeout'))
    vi.mocked(streamAiVocabDraft).mockImplementationOnce(async (_payload, handlers) => {
      handlers?.onStart?.({
        requestedCount: 10,
        generatedCount: 0,
        generatedBatches: 0,
        totalBatches: 1,
      })
      handlers?.onBatch?.(streamBatch(makeWords(1, 10), 10, 10, 1, 1))
      handlers?.onDone?.({
        requestedCount: 10,
        generatedCount: 10,
        generatedBatches: 1,
        totalBatches: 1,
        stoppedReason: '',
      })
    })
    const store = useAiVocabGeneratorStore()
    store.setGenerationMode('chat')
    store.retrievalEnabled = true
    store.language = '英语'
    store.topic = 'X 和 Discord 上的网络聊天表达'
    store.scenario = '社媒聊天'
    store.wordCount = 10

    await store.generateDraft()

    expect(researchAiVocabContext).toHaveBeenCalled()
    expect(streamAiVocabDraft).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'chat',
      retrievalEnabled: false,
      researchSources: [],
    }), expect.any(Object))
    expect(store.researchWarning).toContain('检索失败')
    expect(store.draft?.words).toHaveLength(10)
  })

  it('clears stale draft words before a new failed generation', async () => {
    vi.mocked(streamAiVocabDraft).mockRejectedValueOnce(new Error('AI 未返回有效词条'))
    const store = useAiVocabGeneratorStore()
    store.language = '日语'
    store.topic = '日本旅行点餐常用表达'
    store.draft = draftResponse(makeWords(1, 2), 2)
    store.selectedKeys = store.draft.words.map((word) => `${word.word}::${word.meaningZh}`)

    await store.generateDraft()

    expect(store.draft).toBeNull()
    expect(store.selectedKeys).toEqual([])
    expect(store.error).toBe('AI 未返回有效词条')
  })
})

function draftResponse(words: ReturnType<typeof makeWords>, wordCount: number) {
  return {
    draftId: 'draft_1',
    provider: 'deepseek' as const,
    profile: {
      language: '日语',
      topic: '日本旅行点餐常用表达',
      level: '初级' as const,
      scenario: '旅行',
      wordCount,
      bookName: '旅行日语',
    },
    words,
    createdAt: 1,
  }
}

function streamBatch(
  words: ReturnType<typeof makeWords>,
  requestedCount: number,
  generatedCount: number,
  generatedBatches: number,
  totalBatches: number,
) {
  return {
    ...draftResponse(words, requestedCount),
    requestedCount,
    generatedCount,
    generatedBatches,
    totalBatches,
  }
}

function makeWords(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = start + index
    return {
      word: `ことば${id}`,
      phonetic: `kotoba ${id}`,
      partOfSpeech: 'n.',
      meaningZh: `词条 ${id}`,
      exampleEn: `ことば${id}です。`,
      exampleZh: `这是词条 ${id}。`,
      tags: '旅行',
      difficulty: 1,
    }
  })
}
