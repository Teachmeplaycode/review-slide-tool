// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.mjs'

const tmpDir = path.resolve(process.cwd(), '.tmp')

let app
let server
let baseUrl
let dbPath

beforeEach(async () => {
  fs.mkdirSync(tmpDir, { recursive: true })
  dbPath = path.join(tmpDir, `vocab-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  app = createApp({
    dbPath,
    phoneticAdapter: async ({ words }) => words.map((word) => ({
      wordId: word.id,
      phonetic: `/${word.word}/`,
    })),
    wordRepairAdapter: async ({ words }) => words.map((word) => ({
      wordId: word.id,
      phonetic: `/${word.word}/`,
      partOfSpeech: word.partOfSpeech || 'n.',
      meaningZh: word.meaningZh || '自动释义',
      exampleEn: word.exampleEn || `${word.word} appears in context.`,
      exampleZh: word.exampleZh || '这是自动补全的例句。',
      tags: word.tags || 'ai-repaired',
      difficulty: word.difficulty || 2,
    })),
    studyExplanationAdapter: async ({ items }) => items.map((item) => ({
      itemId: item.id,
      wordId: item.wordId,
      explanation: `${item.word.word} 的简短解析`,
    })),
  })
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

describe('vocabulary API', () => {
  it('initializes the seeded English book once', async () => {
    const first = await request('/api/books')
    const second = await request('/api/books')

    const basicBook = first.books.find((book) => book.id === 'basic_english')
    const cet4Book = first.books.find((book) => book.id === 'cet4_english')
    const secondCet4Book = second.books.find((book) => book.id === 'cet4_english')

    expect(first.books).toHaveLength(2)
    expect(basicBook?.wordCount).toBeGreaterThanOrEqual(100)
    expect(cet4Book?.wordCount).toBe(4544)
    expect(secondCet4Book?.wordCount).toBe(cet4Book?.wordCount)
  })

  it('exports the complete selected word book', async () => {
    const exported = await request('/api/books/basic_english/export')

    expect(exported.book.id).toBe('basic_english')
    expect(exported.wordCount).toBeGreaterThanOrEqual(100)
    expect(exported.words).toHaveLength(exported.wordCount)
    expect(exported.words.some((word) => word.word === 'ability' && word.phonetic)).toBe(true)
  })

  it('seeds CET-4 as a default word book', async () => {
    const exported = await request('/api/books/cet4_english/export')

    expect(exported.book.id).toBe('cet4_english')
    expect(exported.book.name).toBe('CET-4')
    expect(exported.wordCount).toBe(4544)
    expect(exported.words).toHaveLength(4544)
    expect(exported.words.some((word) => word.word === 'abruptly')).toBe(true)
    expect(exported.words.find((word) => word.word === 'abruptly')).toEqual(expect.objectContaining({
      word: 'abruptly',
      meaningZh: '突然地',
      tags: 'CET-4',
    }))
  })

  it('creates recognition study items with the correct answer in choices', async () => {
    const payload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'recognition', count: 5, reviewOnly: false },
    })

    expect(payload.session.totalCount).toBe(5)
    expect(payload.items).toHaveLength(5)
    expect(payload.items[0].mode).toBe('recognition')
    expect(payload.items[0].choices).toHaveLength(4)
    expect(payload.items[0].choices).toContain(payload.items[0].word.meaningZh)
  })

  it('does not cap study sessions at fifty words', async () => {
    const payload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'mixed', count: 80, reviewOnly: false },
    })

    expect(payload.session.totalCount).toBe(80)
    expect(payload.items).toHaveLength(80)
  })

  it('renames a word book and deletes it', async () => {
    const updated = await request('/api/books/basic_english', {
      method: 'PATCH',
      body: { name: '新版基础词库', description: '重命名后的说明' },
    })

    expect(updated.book.name).toBe('新版基础词库')
    expect(updated.book.description).toBe('重命名后的说明')

    await request('/api/books/basic_english', { method: 'DELETE', expectStatus: 204 })
    const payload = await request('/api/books')

    expect(payload.books.some((book) => book.id === 'basic_english')).toBe(false)
    expect(payload.books.some((book) => book.id === 'cet4_english')).toBe(true)
  })

  it('generates missing phonetics with the saved API key', async () => {
    const created = await request('/api/books/basic_english/words', {
      method: 'POST',
      body: {
        word: 'zebrawood',
        phonetic: '',
        partOfSpeech: 'n.',
        meaningZh: '斑马木',
        difficulty: 2,
      },
    })
    await request('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'unit-deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
        reviewEnabled: false,
      },
    })

    const result = await request('/api/books/basic_english/phonetics', {
      method: 'POST',
      body: {},
    })
    const words = await request('/api/books/basic_english/words?query=zebrawood')

    expect(result.requestedCount).toBeGreaterThanOrEqual(1)
    expect(result.remainingCount).toBe(0)
    expect(result.words.some((word) => word.id === created.word.id && word.phonetic === '/zebrawood/')).toBe(true)
    expect(words.words[0].phonetic).toBe('/zebrawood/')
  })

  it('repairs incomplete word fields with the saved API key', async () => {
    const created = await request('/api/books/basic_english/words', {
      method: 'POST',
      body: {
        word: 'contextualize',
        phonetic: '',
        partOfSpeech: '',
        meaningZh: '语境化',
        exampleEn: '',
        exampleZh: '',
        difficulty: 2,
      },
    })
    await request('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'unit-deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
        reviewEnabled: false,
      },
    })

    const result = await request('/api/books/basic_english/repair', {
      method: 'POST',
      body: { limit: 10 },
    })
    const words = await request('/api/books/basic_english/words?query=contextualize')

    expect(result.requestedCount).toBeGreaterThanOrEqual(1)
    expect(result.words.some((word) => word.id === created.word.id)).toBe(true)
    expect(words.words[0].phonetic).toBe('/contextualize/')
    expect(words.words[0].partOfSpeech).toBe('n.')
    expect(words.words[0].exampleEn).toBe('contextualize appears in context.')
  })

  it('repairs incomplete word fields through the background AI job', async () => {
    const created = await request('/api/books/basic_english/words', {
      method: 'POST',
      body: {
        word: 'jobrepair',
        phonetic: '',
        partOfSpeech: '',
        meaningZh: 'keep this meaning',
        exampleEn: '',
        exampleZh: '',
        difficulty: 2,
      },
    })
    await request('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'unit-deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        enabled: false,
        reviewEnabled: false,
      },
    })

    const createdJob = await request('/api/ai/jobs', {
      method: 'POST',
      body: { type: 'repair_words', payload: { bookId: 'basic_english' } },
    })
    const events = await sseGet(`/api/ai/jobs/${createdJob.job.id}/events`)
    const done = events.find((event) => event.event === 'done')
    const batches = events.filter((event) => event.event === 'batch')
    const words = await request('/api/books/basic_english/words?query=jobrepair')

    expect(done.data.status).toBe('succeeded')
    expect(batches.flatMap((event) => event.data.words).some((word) => word.id === created.word.id)).toBe(true)
    expect(words.words[0].meaningZh).toBe('keep this meaning')
    expect(words.words[0].phonetic).toBe('/jobrepair/')
    expect(words.words[0].partOfSpeech).toBe('n.')
    expect(words.words[0].exampleEn).toBe('jobrepair appears in context.')
  })

  it('grades spelling answers case-insensitively and trims spaces', async () => {
    const payload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'spelling', count: 1, reviewOnly: false },
    })
    const item = payload.items[0]

    const answer = await request(`/api/study/${payload.session.id}/answer`, {
      method: 'POST',
      body: {
        wordId: item.wordId,
        mode: item.mode,
        userAnswer: `  ${item.word.word.toUpperCase()}  `,
      },
    })

    expect(answer.correct).toBe(true)
    expect(answer.progress.attempts).toBe(1)
    expect(answer.progress.mastery).toBe(1)
  })

  it('prefetches study explanations only when review AI is enabled', async () => {
    const payload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'spelling', count: 1, reviewOnly: false },
    })

    const skipped = await request(`/api/study/${payload.session.id}/explanations`, {
      method: 'POST',
      body: { items: payload.items },
    })

    await request('/api/settings/ai', {
      method: 'PUT',
      body: {
        apiKey: 'unit-deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: false,
        reviewEnabled: true,
      },
    })
    const explained = await request(`/api/study/${payload.session.id}/explanations`, {
      method: 'POST',
      body: { items: payload.items },
    })

    expect(skipped.skipped).toBe(true)
    expect(explained.skipped).toBe(false)
    expect(explained.explanations[0].itemId).toBe(payload.items[0].id)
  })

  it('records wrong answers and exposes them through review-only sessions', async () => {
    const payload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'spelling', count: 1, reviewOnly: false },
    })
    const item = payload.items[0]

    const answer = await request(`/api/study/${payload.session.id}/answer`, {
      method: 'POST',
      body: {
        wordId: item.wordId,
        mode: item.mode,
        userAnswer: 'wrong-answer',
      },
    })
    const overview = await request('/api/stats/overview?bookId=basic_english')
    const reviewPayload = await request('/api/study/start', {
      method: 'POST',
      body: { bookId: 'basic_english', mode: 'mixed', count: 10, reviewOnly: true },
    })

    expect(answer.correct).toBe(false)
    expect(answer.progress.mastery).toBe(0)
    expect(overview.overview.reviewWords).toBeGreaterThanOrEqual(1)
    expect(reviewPayload.items.some((reviewItem) => reviewItem.wordId === item.wordId)).toBe(true)
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

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
  }

  if (options.expectStatus && response.status !== options.expectStatus) {
    throw new Error(`Expected ${options.expectStatus}, received ${response.status}`)
  }

  return payload
}

async function sseGet(route) {
  const response = await fetch(`${baseUrl}${route}`)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return parseSseEvents(text)
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
