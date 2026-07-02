import express from 'express'
import multer from 'multer'
import { initializeDatabase } from './db.mjs'
import {
  clearAiApiKey,
  clearSearchApiKey,
  getAiSettings,
  getAiSettingsWithKey,
  getSearchSettings,
  getStudyAiSettings,
  saveAiSettings,
  saveSearchSettings,
} from './apiSettingsService.mjs'
import {
  generatePhoneticsWithDeepSeek,
  generateStudyExplanationsWithDeepSeek,
  generateWordRepairsWithDeepSeek,
} from './aiProviders/deepseek.mjs'
import {
  commitVocabularyDraft,
  generateVocabularyDraft,
  planVocabularyConversation,
  researchVocabularyContext,
} from './aiVocabGeneratorService.mjs'
import { createAiJobService } from './aiJobService.mjs'
import { importVocabulary } from './vocabImportService.mjs'
import {
  applyGeneratedPhonetics,
  applyWordRepairs,
  countWordsMissingPhonetics,
  countWordsNeedingRepair,
  createBook,
  createWord,
  deleteBook,
  disableWord,
  exportBook,
  getBookById,
  getOverview,
  getSession,
  getSessionAnswers,
  listBooks,
  listWordsNeedingRepair,
  listWordsMissingPhonetics,
  listWords,
  startStudySession,
  submitStudyAnswer,
  updateBook,
  updateWord,
} from './vocabService.mjs'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
})

export function createApp(options = {}) {
  const app = express()
  const db = options.db ?? initializeDatabase(options.dbPath)
  const aiJobs = options.aiJobs ?? createAiJobService(db, {
    generatorAdapter: options.aiVocabAdapter,
    wordRepairAdapter: options.wordRepairAdapter,
    defaultConcurrency: options.aiJobConcurrency,
    maxConcurrency: options.aiJobMaxConcurrency,
  })
  app.locals.db = db
  app.locals.aiJobs = aiJobs

  app.use(express.json({ limit: '12mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, db: 'sqlite' })
  })

  app.get('/api/books', (_request, response) => {
    response.json({ books: listBooks(db) })
  })

  app.post('/api/books', (request, response, next) => {
    try {
      response.status(201).json({ book: createBook(db, request.body ?? {}) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/settings/ai', (_request, response) => {
    response.json({ settings: getAiSettings(db) })
  })

  app.put('/api/settings/ai', (request, response, next) => {
    try {
      response.json({ settings: saveAiSettings(db, request.body ?? {}) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/settings/ai/key', (_request, response, next) => {
    try {
      response.json({ settings: clearAiApiKey(db) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/settings/search', (_request, response) => {
    response.json({ settings: getSearchSettings(db) })
  })

  app.put('/api/settings/search', (request, response, next) => {
    try {
      response.json({ settings: saveSearchSettings(db, request.body ?? {}) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/settings/search/key', (_request, response, next) => {
    try {
      response.json({ settings: clearSearchApiKey(db) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/vocab/chat', async (request, response, next) => {
    try {
      const result = await planVocabularyConversation(db, request.body ?? {}, {
        conversationAdapter: options.conversationAdapter,
      })
      response.json(result)
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/vocab/research', async (request, response, next) => {
    try {
      const result = await researchVocabularyContext(db, request.body ?? {}, {
        searchAdapter: options.searchAdapter,
      })
      response.json(result)
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/vocab/draft', async (request, response, next) => {
    try {
      const result = await generateVocabularyDraft(db, request.body ?? {}, {
        generatorAdapter: options.aiVocabAdapter,
      })
      response.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/vocab/commit', (request, response, next) => {
    try {
      response.status(201).json(commitVocabularyDraft(db, request.body ?? {}))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/jobs', async (request, response, next) => {
    try {
      const job = await aiJobs.createJob(request.body ?? {})
      response.status(201).json({ job })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/ai/jobs/:jobId', (request, response) => {
    const job = aiJobs.getJob(request.params.jobId)
    if (!job) {
      response.status(404).json({ error: 'AI job not found' })
      return
    }
    response.json({ job })
  })

  app.post('/api/ai/jobs/:jobId/cancel', (request, response) => {
    const job = aiJobs.cancelJob(request.params.jobId)
    if (!job) {
      response.status(404).json({ error: 'AI job not found' })
      return
    }
    response.json({ job })
  })

  app.get('/api/ai/jobs/:jobId/events', (request, response) => {
    const job = aiJobs.getJob(request.params.jobId)
    if (!job) {
      response.status(404).json({ error: 'AI job not found' })
      return
    }

    response.status(200)
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders?.()

    let keepAlive
    let unsubscribe = () => {}
    const closeStream = () => {
      if (keepAlive) clearInterval(keepAlive)
      unsubscribe()
      if (!response.writableEnded) response.end()
    }
    const send = (event, data) => {
      const written = writeSseEvent(response, event, data)
      if (!written || event === 'done' || event === 'error') {
        closeStream()
      }
      return written
    }
    unsubscribe = aiJobs.subscribe(request.params.jobId, send)
    const replayEnded = aiJobs.replay(job, send)

    keepAlive = setInterval(() => {
      if (!response.writableEnded && !response.destroyed) response.write(': keep-alive\n\n')
    }, 15000)
    keepAlive.unref?.()

    if (replayEnded) {
      clearInterval(keepAlive)
      unsubscribe()
      response.end()
      return
    }

    response.on('close', () => {
      clearInterval(keepAlive)
      unsubscribe()
    })
  })

  app.patch('/api/books/:bookId', (request, response, next) => {
    try {
      const book = updateBook(db, request.params.bookId, request.body ?? {})
      if (!book) {
        response.status(404).json({ error: '词库不存在' })
        return
      }
      response.json({ book })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/books/:bookId', (request, response) => {
    if (!deleteBook(db, request.params.bookId)) {
      response.status(404).json({ error: '词库不存在' })
      return
    }
    response.status(204).end()
  })

  app.get('/api/books/:bookId/export', (request, response, next) => {
    try {
      response.json(exportBook(db, request.params.bookId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/books/:bookId/words', (request, response) => {
    response.json(listWords(db, request.params.bookId, request.query))
  })

  app.post('/api/books/:bookId/phonetics', async (request, response, next) => {
    try {
      const settings = getAiSettingsWithKey(db)
      if (!settings) {
        throw createHttpError(400, '需要先保存 DeepSeek API Key')
      }

      const words = listWordsMissingPhonetics(db, request.params.bookId, request.body?.limit)
      if (!words.length) {
        response.json({ requestedCount: 0, updatedCount: 0, skippedCount: 0, remainingCount: 0, words: [] })
        return
      }

      const adapter = options.phoneticAdapter ?? generatePhoneticsWithDeepSeek
      const book = getBookById(db, request.params.bookId)
      const phonetics = await adapter({ words, language: book?.language, settings })
      const result = applyGeneratedPhonetics(db, request.params.bookId, phonetics)
      response.json({
        requestedCount: words.length,
        remainingCount: countWordsMissingPhonetics(db, request.params.bookId),
        ...result,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/books/:bookId/repair', async (request, response, next) => {
    try {
      const settings = getAiSettingsWithKey(db)
      if (!settings) {
        throw createHttpError(400, '需要先保存 DeepSeek API Key')
      }

      const words = listWordsNeedingRepair(db, request.params.bookId, request.body?.limit)
      if (!words.length) {
        response.json({ requestedCount: 0, updatedCount: 0, skippedCount: 0, remainingCount: 0, words: [] })
        return
      }

      const adapter = options.wordRepairAdapter ?? generateWordRepairsWithDeepSeek
      const book = getBookById(db, request.params.bookId)
      const repairs = await adapter({ words, language: book?.language, settings })
      const result = applyWordRepairs(db, request.params.bookId, repairs)
      response.json({
        requestedCount: words.length,
        remainingCount: countWordsNeedingRepair(db, request.params.bookId),
        ...result,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/books/:bookId/words', (request, response, next) => {
    try {
      response.status(201).json({ word: createWord(db, request.params.bookId, request.body ?? {}) })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/words/:wordId', (request, response, next) => {
    try {
      const word = updateWord(db, request.params.wordId, request.body ?? {})
      if (!word) {
        response.status(404).json({ error: '词条不存在' })
        return
      }
      response.json({ word })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/words/:wordId', (request, response) => {
    if (!disableWord(db, request.params.wordId)) {
      response.status(404).json({ error: '词条不存在' })
      return
    }
    response.status(204).end()
  })

  app.post('/api/study/start', (request, response, next) => {
    try {
      response.status(201).json(startStudySession(db, request.body ?? {}))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/study/:sessionId/answer', (request, response, next) => {
    try {
      response.json(submitStudyAnswer(db, request.params.sessionId, request.body ?? {}))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/study/:sessionId/explanations', async (request, response, next) => {
    try {
      const session = getSession(db, request.params.sessionId)
      if (!session) {
        response.status(404).json({ error: '学习会话不存在' })
        return
      }

      const settings = getStudyAiSettings(db)
      if (!settings) {
        response.json({ skipped: true, explanations: [] })
        return
      }

      const adapter = options.studyExplanationAdapter ?? generateStudyExplanationsWithDeepSeek
      const explanations = await adapter({
        items: request.body?.items ?? [],
        settings,
      })
      response.json({ skipped: false, explanations })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/study/:sessionId', (request, response) => {
    const session = getSession(db, request.params.sessionId)
    if (!session) {
      response.status(404).json({ error: '学习会话不存在' })
      return
    }
    response.json({ session, answers: getSessionAnswers(db, request.params.sessionId) })
  })

  app.get('/api/stats/overview', (request, response) => {
    response.json({ overview: getOverview(db, String(request.query.bookId ?? 'basic_english')) })
  })

  app.post('/api/import/vocab', upload.single('file'), async (request, response, next) => {
    try {
      const result = await importVocabulary(db, {
        file: request.file,
        targetMode: request.body?.targetMode,
        bookId: request.body?.bookId,
        bookName: request.body?.bookName,
        language: request.body?.language,
      })
      response.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  app.use((error, _request, response, _next) => {
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: '文件不能超过 8MB' })
      return
    }

    const status = Number(error.status) || 500
    response.status(status).json({ error: error.message || '服务器错误' })
  })

  return app
}

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function writeSseEvent(response, event, data) {
  if (response.writableEnded || response.destroyed) return false

  try {
    response.write(`event: ${event}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
    return true
  } catch {
    return false
  }
}
