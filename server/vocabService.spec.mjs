// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'

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

    expect(first.books).toHaveLength(1)
    expect(first.books[0].id).toBe('basic_english')
    expect(first.books[0].wordCount).toBeGreaterThanOrEqual(100)
    expect(second.books[0].wordCount).toBe(first.books[0].wordCount)
  })

  it('exports the complete selected word book', async () => {
    const exported = await request('/api/books/basic_english/export')

    expect(exported.book.id).toBe('basic_english')
    expect(exported.wordCount).toBeGreaterThanOrEqual(100)
    expect(exported.words).toHaveLength(exported.wordCount)
    expect(exported.words.some((word) => word.word === 'ability' && word.phonetic)).toBe(true)
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

    expect(payload.books).toHaveLength(0)
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
        apiKey: 'sk-test',
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
        apiKey: 'sk-test',
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
