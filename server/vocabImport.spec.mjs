// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.mjs'
import { parseDeepSeekWords } from './aiProviders/deepseek.mjs'

const tmpDir = path.resolve(process.cwd(), '.tmp')

vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 })

let app
let server
let baseUrl
let dbPath
let aiAdapter
let aiVocabAdapter
let conversationAdapter
let searchAdapter

beforeEach(async () => {
  fs.mkdirSync(tmpDir, { recursive: true })
  dbPath = path.join(tmpDir, `import-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  aiAdapter = vi.fn()
  aiVocabAdapter = vi.fn()
  conversationAdapter = vi.fn()
  searchAdapter = vi.fn()
  app = createApp({ dbPath, aiAdapter, aiVocabAdapter, conversationAdapter, searchAdapter })
  server = await listen(app)
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await closeServer(server)
  app.locals.db.close()

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true })
  }
})

describe('vocabulary import API', () => {
  it('saves DeepSeek settings without returning the full API key', async () => {
    const saved = await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-1234567890abcdef',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: true,
      },
    })
    const loaded = await json('/api/settings/ai')

    expect(saved.settings.enabled).toBe(true)
    expect(saved.settings.hasApiKey).toBe(true)
    expect(saved.settings.apiKeyPreview).toBe('sk-1****cdef')
    expect(JSON.stringify(loaded)).not.toContain('sk-1234567890abcdef')
  })

  it('saves Tavily search settings without returning the full API key', async () => {
    const saved = await json('/api/settings/search', {
      method: 'PUT',
      body: {
        apiKey: 'tvly-1234567890abcdef',
        baseUrl: 'https://api.tavily.com',
        enabled: true,
      },
    })
    const loaded = await json('/api/settings/search')

    expect(saved.settings.provider).toBe('tavily')
    expect(saved.settings.enabled).toBe(true)
    expect(saved.settings.hasApiKey).toBe(true)
    expect(saved.settings.apiKeyPreview).toBe('tvly****cdef')
    expect(JSON.stringify(loaded)).not.toContain('tvly-1234567890abcdef')
  })

  it('plans an advanced AI vocabulary profile from chat messages', async () => {
    conversationAdapter.mockResolvedValue({
      message: '已整理成英语社媒聊天词库。',
      questions: ['更偏 X 还是 Discord？'],
      ready: true,
      profile: {
        language: '英语',
        topic: 'X 和 Discord 上的网络聊天表达',
        level: '中级',
        scenario: '社媒聊天',
        wordCount: 80,
        bookName: '英语社媒聊天词库',
      },
    })
    await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-abcdef123456',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
      },
    })

    const plan = await json('/api/ai/vocab/chat', {
      method: 'POST',
      body: {
        conversation: [
          { role: 'user', content: '我想做一个 X/Discord 网络聊天词库' },
        ],
        profile: {
          language: '英语',
          topic: '网络聊天表达',
          level: '初级',
          wordCount: 50,
        },
      },
    })

    expect(plan.ready).toBe(true)
    expect(plan.profile.language).toBe('英语')
    expect(plan.profile.level).toBe('中级')
    expect(conversationAdapter).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ apiKey: 'sk-abcdef123456' }),
      conversation: [expect.objectContaining({ role: 'user' })],
    }))
  })

  it('researches vocabulary context with Tavily settings', async () => {
    searchAdapter.mockResolvedValue({
      query: '英语 X Discord 网络聊天表达',
      answer: '社媒聊天常见缩写和互动表达。',
      provider: 'tavily',
      sources: [
        {
          title: 'Internet slang guide',
          url: 'https://example.com/slang',
          content: 'Common chat abbreviations and meme expressions.',
          publishedDate: '2026-06-01',
          score: 0.9,
        },
      ],
    })
    await json('/api/settings/search', {
      method: 'PUT',
      body: {
        apiKey: 'tvly-abcdef123456',
        baseUrl: 'https://api.tavily.com',
        enabled: true,
      },
    })

    const result = await json('/api/ai/vocab/research', {
      method: 'POST',
      body: {
        profile: {
          language: '英语',
          topic: 'X 和 Discord 上的网络聊天表达',
          level: '中级',
          scenario: '社媒聊天',
          wordCount: 80,
          bookName: '英语社媒聊天词库',
        },
        conversation: [
          { role: 'user', content: '包含网络热梗和缩写' },
        ],
      },
    })

    expect(result.provider).toBe('tavily')
    expect(result.sources).toHaveLength(1)
    expect(searchAdapter).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ apiKey: 'tvly-abcdef123456' }),
      maxResults: undefined,
    }))
  })

  it('imports a txt file into a new book using the local parser when API settings are absent', async () => {
    const result = await multipart('/api/import/vocab', {
      fileName: 'unit-words.txt',
      text: ['apple - 苹果', 'banana /bəˈnænə/ n. 香蕉', '| word | phonetic | pos | meaning |', '| book | /bʊk/ | n. | 书 |'].join('\n'),
      fields: {
        targetMode: 'new_book',
        bookName: '单元词库',
        language: '英语',
      },
    })
    const words = await json(`/api/books/${result.book.id}/words`)

    expect(result.provider).toBe('local')
    expect(result.usedAi).toBe(false)
    expect(result.book.language).toBe('英语')
    expect(result.importedCount).toBe(3)
    expect(result.skippedCount).toBe(0)
    expect(words.total).toBe(3)
  })

  it('merges into the current book and skips duplicate words', async () => {
    const first = await multipart('/api/import/vocab', {
      fileName: 'first.txt',
      text: 'apple - 苹果',
      fields: {
        targetMode: 'new_book',
        bookName: '合并测试',
        language: '英语',
      },
    })
    const second = await multipart('/api/import/vocab', {
      fileName: 'second.txt',
      text: ['apple - 苹果', 'pear - 梨'].join('\n'),
      fields: {
        targetMode: 'merge_current',
        bookId: first.book.id,
      },
    })
    const words = await json(`/api/books/${first.book.id}/words`)

    expect(second.importedCount).toBe(1)
    expect(second.skippedCount).toBe(1)
    expect(words.total).toBe(2)
  })

  it('uses the configured DeepSeek adapter and normalizes AI output', async () => {
    aiAdapter.mockResolvedValue([
      { word: 'ocean', meaningZh: '海洋', phonetic: '/ˈəʊʃn/', partOfSpeech: 'n.', difficulty: 2 },
      { word: '', meaningZh: '无效' },
      { word: 'ocean', meaningZh: '海洋重复' },
    ])
    await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-abcdef123456',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: true,
      },
    })

    const result = await multipart('/api/import/vocab', {
      fileName: 'ai.txt',
      text: '请整理 ocean 这个单词',
      fields: {
        targetMode: 'new_book',
        bookName: 'AI 词库',
        language: '英语',
      },
    })

    expect(aiAdapter).toHaveBeenCalledWith(expect.objectContaining({
      sourceFile: 'ai.txt',
      language: '英语',
      settings: expect.objectContaining({ apiKey: 'sk-abcdef123456' }),
    }))
    expect(result.provider).toBe('deepseek')
    expect(result.usedAi).toBe(true)
    expect(result.importedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(result.previewWords[0].word).toBe('ocean')
  })

  it('imports unicode terms for a custom language', async () => {
    const result = await multipart('/api/import/vocab', {
      fileName: 'jp.txt',
      text: ['こんにちは - 你好', 'ありがとう - 谢谢', '| 词条 | 释义 |', '| すみません | 不好意思 |'].join('\n'),
      fields: {
        targetMode: 'new_book',
        bookName: '旅行日语',
        language: '日语',
      },
    })
    const words = await json(`/api/books/${result.book.id}/words`)

    expect(result.book.language).toBe('日语')
    expect(result.importedCount).toBe(3)
    expect(words.words.map((word) => word.word)).toEqual(['ありがとう', 'こんにちは', 'すみません'])
  })

  it('generates an AI draft and commits selected words into a custom-language book', async () => {
    aiVocabAdapter.mockResolvedValue([
      { word: 'bonjour', phonetic: '/bɔ̃ʒuʁ/', partOfSpeech: 'interj.', meaningZh: '你好', difficulty: 1 },
      { word: 'merci', phonetic: '/mɛʁsi/', partOfSpeech: 'interj.', meaningZh: '谢谢', difficulty: 1 },
      { word: '', meaningZh: '无效' },
    ])
    await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-abcdef123456',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
      },
    })

    const draft = await json('/api/ai/vocab/draft', {
      method: 'POST',
      body: {
        language: '法语',
        topic: '去巴黎旅行常用问候',
        level: '入门',
        scenario: '旅行',
        wordCount: 5000,
        bookName: '旅行法语',
      },
    })
    const committed = await json('/api/ai/vocab/commit', {
      method: 'POST',
      body: {
        language: draft.profile.language,
        topic: draft.profile.topic,
        bookName: draft.profile.bookName,
        targetMode: 'new_book',
        words: draft.words.slice(0, 1),
      },
    })
    const merged = await json('/api/ai/vocab/commit', {
      method: 'POST',
      body: {
        language: draft.profile.language,
        topic: draft.profile.topic,
        bookName: draft.profile.bookName,
        targetMode: 'merge_current',
        bookId: committed.book.id,
        words: draft.words,
      },
    })
    const words = await json(`/api/books/${committed.book.id}/words`)

    expect(aiVocabAdapter).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ language: '法语', wordCount: 5000 }),
      settings: expect.objectContaining({ apiKey: 'sk-abcdef123456' }),
    }))
    expect(draft.words).toHaveLength(2)
    expect(committed.book.language).toBe('法语')
    expect(committed.importedCount).toBe(1)
    expect(merged.importedCount).toBe(1)
    expect(merged.skippedCount).toBe(1)
    expect(words.total).toBe(2)
  })

  it('accepts concise AI generation topics from chat profiles', async () => {
    aiVocabAdapter.mockResolvedValue([
      { word: 'thesis', phonetic: '/ˈθiːsɪs/', partOfSpeech: 'n.', meaningZh: '论文；论点', difficulty: 3 },
    ])
    await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-abcdef123456',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
      },
    })

    const draft = await json('/api/ai/vocab/draft', {
      method: 'POST',
      body: {
        language: '英语',
        topic: '考研英语',
        level: '专业',
        scenario: '考试准备',
        wordCount: 10,
        bookName: '考研英语词库',
      },
    })

    expect(draft.words).toHaveLength(1)
    expect(aiVocabAdapter).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ topic: '考研英语', wordCount: 10 }),
    }))
  })

  it('streams AI draft words in backend batches', async () => {
    aiVocabAdapter.mockImplementation(({ profile }) => {
      const start = profile.existingWords.length + 1
      return makeAiWords(start, profile.wordCount)
    })
    await json('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'sk-abcdef123456',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
      },
    })

    const events = await sse('/api/ai/vocab/stream', {
      body: {
        language: '日语',
        topic: '日本旅行点餐常用表达',
        level: '初级',
        scenario: '旅行',
        wordCount: 120,
        bookName: '旅行日语',
      },
    })
    const batches = events.filter((event) => event.event === 'batch')
    const done = events.find((event) => event.event === 'done')

    expect(events[0]).toEqual(expect.objectContaining({
      event: 'start',
      data: expect.objectContaining({ requestedCount: 120, totalBatches: 12 }),
    }))
    expect(batches).toHaveLength(12)
    expect(batches.every((batch) => batch.data.words.length === 10)).toBe(true)
    expect(done.data).toEqual(expect.objectContaining({
      requestedCount: 120,
      generatedCount: 120,
      generatedBatches: 12,
    }))
    expect(aiVocabAdapter).toHaveBeenNthCalledWith(1, expect.objectContaining({
      profile: expect.objectContaining({ wordCount: 10, existingWords: [] }),
    }))
    expect(aiVocabAdapter).toHaveBeenNthCalledWith(2, expect.objectContaining({
      profile: expect.objectContaining({
        wordCount: 10,
        existingWords: makeAiWords(1, 10).map((word) => word.word),
      }),
    }))
    expect(aiVocabAdapter).toHaveBeenNthCalledWith(12, expect.objectContaining({
      profile: expect.objectContaining({
        wordCount: 10,
        existingWords: makeAiWords(1, 110).map((word) => word.word),
      }),
    }))
  })
})

describe('DeepSeek response parsing', () => {
  it('parses fenced JSON returned by a model', () => {
    const words = parseDeepSeekWords('```json\n{"words":[{"word":"river","meaningZh":"河流"}]}\n```')

    expect(words).toEqual([{ word: 'river', meaningZh: '河流' }])
  })

  it('does not throw raw JSON parse errors for malformed model output', () => {
    const words = parseDeepSeekWords('{"words":[{"word":"broken","meaningZh":"损坏"}')

    expect(words).toEqual([])
  })
})

function listen(targetApp) {
  return new Promise((resolve) => {
    const testServer = targetApp.listen(0, '127.0.0.1', () => resolve(testServer))
  })
}

function closeServer(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function json(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return readResponse(response)
}

async function sse(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return parseSseEvents(text)
}

async function multipart(route, { fileName, text, fields }) {
  const form = new FormData()
  form.append('file', new Blob([text], { type: 'text/plain' }), fileName)

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    body: form,
  })
  return readResponse(response)
}

async function readResponse(response) {
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
  }

  return payload
}

function parseSseEvents(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let event = 'message'
      const dataLines = []

      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart())
        }
      }

      return dataLines.length
        ? { event, data: JSON.parse(dataLines.join('\n')) }
        : null
    })
    .filter(Boolean)
}

function makeAiWords(start, count) {
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
