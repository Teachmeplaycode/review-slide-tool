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

beforeEach(async () => {
  fs.mkdirSync(tmpDir, { recursive: true })
  dbPath = path.join(tmpDir, `import-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  aiAdapter = vi.fn()
  app = createApp({ dbPath, aiAdapter })
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

  it('imports a txt file into a new book using the local parser when API settings are absent', async () => {
    const result = await multipart('/api/import/vocab', {
      fileName: 'unit-words.txt',
      text: ['apple - 苹果', 'banana /bəˈnænə/ n. 香蕉', '| word | phonetic | pos | meaning |', '| book | /bʊk/ | n. | 书 |'].join('\n'),
      fields: {
        targetMode: 'new_book',
        bookName: '单元词库',
      },
    })
    const words = await json(`/api/books/${result.book.id}/words`)

    expect(result.provider).toBe('local')
    expect(result.usedAi).toBe(false)
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
      },
    })

    expect(aiAdapter).toHaveBeenCalledWith(expect.objectContaining({
      sourceFile: 'ai.txt',
      settings: expect.objectContaining({ apiKey: 'sk-abcdef123456' }),
    }))
    expect(result.provider).toBe('deepseek')
    expect(result.usedAi).toBe(true)
    expect(result.importedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(result.previewWords[0].word).toBe('ocean')
  })
})

describe('DeepSeek response parsing', () => {
  it('parses fenced JSON returned by a model', () => {
    const words = parseDeepSeekWords('```json\n{"words":[{"word":"river","meaningZh":"河流"}]}\n```')

    expect(words).toEqual([{ word: 'river', meaningZh: '河流' }])
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
