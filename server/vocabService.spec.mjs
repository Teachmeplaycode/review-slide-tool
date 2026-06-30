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
  app = createApp({ dbPath })
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

  return payload
}
