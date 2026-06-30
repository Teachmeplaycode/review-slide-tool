import express from 'express'
import multer from 'multer'
import { initializeDatabase } from './db.mjs'
import { getAiSettings, saveAiSettings } from './apiSettingsService.mjs'
import { importVocabulary } from './vocabImportService.mjs'
import {
  createWord,
  disableWord,
  getOverview,
  getSession,
  getSessionAnswers,
  listBooks,
  listWords,
  startStudySession,
  submitStudyAnswer,
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
  app.locals.db = db

  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, db: 'sqlite' })
  })

  app.get('/api/books', (_request, response) => {
    response.json({ books: listBooks(db) })
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

  app.get('/api/books/:bookId/words', (request, response) => {
    response.json(listWords(db, request.params.bookId, request.query))
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
        response.status(404).json({ error: '单词不存在' })
        return
      }
      response.json({ word })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/words/:wordId', (request, response) => {
    if (!disableWord(db, request.params.wordId)) {
      response.status(404).json({ error: '单词不存在' })
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
      }, {
        aiAdapter: options.aiAdapter,
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
