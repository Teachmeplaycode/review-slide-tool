import crypto from 'node:crypto'
import { getAiSettingsWithKey } from './apiSettingsService.mjs'
import { generateVocabularyDraft } from './aiVocabGeneratorService.mjs'
import { createHttpError } from './vocabImportService.mjs'
import {
  applyWordRepairs,
  countWordsNeedingRepair,
  getBookById,
  listWordsNeedingRepair,
} from './vocabService.mjs'
import { generateWordRepairsWithDeepSeek } from './aiProviders/deepseek.mjs'

const JOB_TYPES = new Set(['generate_vocab', 'repair_words'])
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled'])
const UI_BATCH_SIZE = 10
const GENERATE_ACCEPT_SIZE = 80
const GENERATE_REQUEST_SIZE = 96
const REPAIR_REQUEST_SIZE = 80
const MAX_GENERATED_WORDS = 5000
const MAX_EMPTY_REQUESTS = 10
const MAX_CHUNK_RETRIES = 3
const DEFAULT_CONCURRENCY = 16
const MAX_CONCURRENCY = 32

export function createAiJobService(db, options = {}) {
  const scheduler = options.scheduler ?? new AiRequestScheduler({
    defaultConcurrency: options.defaultConcurrency ?? DEFAULT_CONCURRENCY,
    maxConcurrency: options.maxConcurrency ?? MAX_CONCURRENCY,
  })
  const subscribers = new Map()
  const canceled = new Set()

  async function createJob(input = {}) {
    const type = String(input.type ?? '')
    if (!JOB_TYPES.has(type)) throw createHttpError(400, 'AI job type is invalid')

    const now = Date.now()
    const id = createId('ai_job')
    const payload = normalizeJobPayload(type, input.payload ?? input)
    const progress = initialProgress(type, payload, scheduler)

    db.prepare(`
      INSERT INTO ai_jobs (
        id,
        type,
        status,
        payload_json,
        progress_json,
        result_json,
        error_message,
        cancel_requested,
        created_at,
        started_at,
        completed_at,
        updated_at
      )
      VALUES (?, ?, 'queued', ?, ?, '[]', '', 0, ?, NULL, NULL, ?)
    `).run(id, type, stringifyJson(payload), stringifyJson(progress), now, now)

    queueMicrotask(() => {
      runJob(id).catch((error) => {
        failJob(id, error)
      })
    })

    return getJob(id)
  }

  function getJob(id) {
    const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id)
    return row ? mapJob(row) : null
  }

  function cancelJob(id) {
    const job = getJob(id)
    if (!job) return null
    canceled.add(id)

    const now = Date.now()
    const nextStatus = job.status === 'queued' ? 'canceled' : job.status
    db.prepare(`
      UPDATE ai_jobs
      SET cancel_requested = 1,
        status = ?,
        completed_at = CASE WHEN ? = 'canceled' THEN ? ELSE completed_at END,
        updated_at = ?
      WHERE id = ?
    `).run(nextStatus, nextStatus, now, now, id)

    const updated = getJob(id)
    emit(id, 'progress', updated.progress)
    if (updated.status === 'canceled') emit(id, 'done', donePayload(updated))
    return updated
  }

  function subscribe(jobId, listener) {
    if (!subscribers.has(jobId)) subscribers.set(jobId, new Set())
    subscribers.get(jobId).add(listener)
    return () => subscribers.get(jobId)?.delete(listener)
  }

  function replay(job, send) {
    send('start', startPayload(job))
    const chunks = chunkItems(job.result, UI_BATCH_SIZE)
    for (const [index, words] of chunks.entries()) {
      send('batch', batchPayload(job, words, index + 1))
    }
    if (TERMINAL_STATUSES.has(job.status)) {
      if (job.status === 'failed') {
        send('error', { jobId: job.id, error: job.errorMessage || 'AI job failed', ...job.progress })
      } else {
        send('done', donePayload(job))
      }
      return true
    }
    send('progress', job.progress)
    return false
  }

  async function runJob(id) {
    const job = getJob(id)
    if (!job || TERMINAL_STATUSES.has(job.status)) return
    if (job.cancelRequested) {
      completeJob(id, 'canceled')
      return
    }

    updateJob(id, {
      status: 'running',
      startedAt: Date.now(),
      progress: {
        ...job.progress,
        status: 'running',
      },
    })
    emit(id, 'start', startPayload(getJob(id)))

    if (job.type === 'generate_vocab') {
      await runGenerateJob(id)
    } else {
      await runRepairJob(id)
    }
  }

  async function runGenerateJob(id) {
    const job = getJob(id)
    const payload = job.payload
    const requestedCount = clampNumber(payload.wordCount ?? payload.count ?? 20, 5, MAX_GENERATED_WORDS)
    const initialExistingWords = normalizeExistingWords(payload.existingWords)
    const allWords = [...job.result]
    const draftId = payload.draftId || createId('draft')
    const createdAt = job.createdAt
    let requestIndex = 0
    let completedRequests = 0
    let activeRequests = 0
    let generatedBatches = Math.ceil(allWords.length / UI_BATCH_SIZE)
    let emptyRequests = 0
    let fatalError = null

    async function launchChunk() {
      requestIndex += 1
      const chunkIndex = requestIndex
      activeRequests += 1
      persistProgress(id, {
        activeRequests,
        completedRequests,
        currentBatch: generatedBatches + 1,
        requestedBatchSize: GENERATE_ACCEPT_SIZE,
      })

      try {
        const snapshotExisting = [
          ...initialExistingWords,
          ...allWords.map((word) => word.word),
        ]
        const draft = await runWithRetries(id, chunkIndex, () => scheduler.schedule(() => generateVocabularyDraft(db, {
          ...payload,
          wordCount: GENERATE_REQUEST_SIZE,
          batchIndex: chunkIndex,
          existingWords: snapshotExisting,
          batchFocus: buildConcurrentBatchFocus(payload, chunkIndex, requestedCount),
          generationRange: `chunk ${chunkIndex} / ${Math.ceil(requestedCount / GENERATE_ACCEPT_SIZE)}`,
        }, {
          generatorAdapter: options.generatorAdapter,
          timeoutMs: options.timeoutMs,
        })))

        const nextWords = uniqueNewWords(allWords, draft.words)
          .slice(0, Math.min(GENERATE_ACCEPT_SIZE, Math.max(0, requestedCount - allWords.length)))
        if (!nextWords.length) {
          emptyRequests += 1
          return
        }

        emptyRequests = 0
        allWords.push(...nextWords)
        for (const chunk of chunkItems(nextWords, UI_BATCH_SIZE)) {
          generatedBatches += 1
          appendResults(id, chunk, {
            generatedCount: allWords.length,
            generatedBatches,
            currentBatch: Math.min(generatedBatches + 1, estimateUiBatches(requestedCount)),
          })
          emit(id, 'batch', {
            jobId: id,
            draftId,
            provider: 'deepseek',
            profile: { ...draft.profile, wordCount: requestedCount, existingWords: initialExistingWords },
            words: chunk,
            createdAt,
            requestedCount,
            generatedCount: allWords.length,
            generatedBatches,
            totalBatches: estimateUiBatches(requestedCount),
            requestedBatchSize: GENERATE_ACCEPT_SIZE,
            dynamicConcurrency: scheduler.dynamicLimit,
            activeRequests,
            completedRequests,
          })
        }
      } catch (error) {
        if (isFatalError(error)) fatalError = error
        else emptyRequests += 1
      } finally {
        activeRequests -= 1
        completedRequests += 1
        persistProgress(id, {
          activeRequests,
          completedRequests,
          generatedCount: allWords.length,
          generatedBatches,
          dynamicConcurrency: scheduler.dynamicLimit,
        })
      }
    }

    const inFlight = new Set()
    while (!isCanceled(id) && !fatalError && allWords.length < requestedCount && emptyRequests < MAX_EMPTY_REQUESTS) {
      while (
        inFlight.size < scheduler.dynamicLimit
        && allWords.length + inFlight.size * GENERATE_ACCEPT_SIZE < requestedCount + GENERATE_ACCEPT_SIZE
        && emptyRequests < MAX_EMPTY_REQUESTS
      ) {
        const promise = launchChunk().finally(() => inFlight.delete(promise))
        inFlight.add(promise)
      }

      if (!inFlight.size) break
      await Promise.race(inFlight)
    }

    await Promise.allSettled(inFlight)
    if (fatalError) throw fatalError
    if (!allWords.length) throw createHttpError(400, 'AI 未返回有效词条')
    completeJob(id, isCanceled(id) ? 'canceled' : 'succeeded', {
      stoppedReason: allWords.length < requestedCount ? 'empty_batches' : '',
    })
  }

  async function runRepairJob(id) {
    const job = getJob(id)
    const payload = job.payload
    const bookId = payload.bookId
    const settings = getAiSettingsWithKey(db)
    if (!settings) throw createHttpError(400, '需要先保存 DeepSeek API Key')

    const book = getBookById(db, bookId)
    if (!book) throw createHttpError(404, '词库不存在')

    const words = listWordsNeedingRepair(db, bookId, MAX_GENERATED_WORDS)
    const chunks = chunkItems(words, REPAIR_REQUEST_SIZE)
    persistProgress(id, {
      requestedCount: words.length,
      totalBatches: estimateUiBatches(words.length),
      requestedBatchSize: REPAIR_REQUEST_SIZE,
      remainingCount: countWordsNeedingRepair(db, bookId),
    })

    let activeRequests = 0
    let completedRequests = 0
    let updatedCount = job.result.length
    let generatedBatches = Math.ceil(job.result.length / UI_BATCH_SIZE)
    let fatalError = null

    async function launchRepair(chunk, index) {
      activeRequests += 1
      persistProgress(id, { activeRequests, completedRequests, currentBatch: index + 1 })
      try {
        const repairs = await runWithRetries(id, index + 1, () => scheduler.schedule(() => {
          const adapter = options.wordRepairAdapter ?? generateWordRepairsWithDeepSeek
          return adapter({ words: chunk, language: book.language, settings })
        }))
        const result = applyWordRepairs(db, bookId, repairs)
        if (!result.words.length) return

        updatedCount += result.updatedCount
        for (const wordsChunk of chunkItems(result.words, UI_BATCH_SIZE)) {
          generatedBatches += 1
          appendResults(id, wordsChunk, {
            generatedCount: updatedCount,
            repairedCount: updatedCount,
            generatedBatches,
            remainingCount: countWordsNeedingRepair(db, bookId),
          })
          emit(id, 'batch', {
            jobId: id,
            type: 'repair_words',
            words: wordsChunk,
            requestedCount: words.length,
            generatedCount: updatedCount,
            repairedCount: updatedCount,
            generatedBatches,
            totalBatches: estimateUiBatches(words.length),
            remainingCount: countWordsNeedingRepair(db, bookId),
            dynamicConcurrency: scheduler.dynamicLimit,
            activeRequests,
            completedRequests,
          })
        }
      } catch (error) {
        if (isFatalError(error)) fatalError = error
      } finally {
        activeRequests -= 1
        completedRequests += 1
        persistProgress(id, {
          activeRequests,
          completedRequests,
          generatedCount: updatedCount,
          repairedCount: updatedCount,
          remainingCount: countWordsNeedingRepair(db, bookId),
          dynamicConcurrency: scheduler.dynamicLimit,
        })
      }
    }

    const inFlight = new Set()
    let nextIndex = 0
    while (!isCanceled(id) && !fatalError && (nextIndex < chunks.length || inFlight.size)) {
      while (nextIndex < chunks.length && inFlight.size < scheduler.dynamicLimit && !isCanceled(id)) {
        const index = nextIndex
        nextIndex += 1
        const promise = launchRepair(chunks[index], index).finally(() => inFlight.delete(promise))
        inFlight.add(promise)
      }
      if (!inFlight.size) break
      await Promise.race(inFlight)
    }

    await Promise.allSettled(inFlight)
    if (fatalError) throw fatalError
    completeJob(id, isCanceled(id) ? 'canceled' : 'succeeded')
  }

  async function runWithRetries(jobId, chunkIndex, task) {
    let lastError = null
    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt += 1) {
      if (isCanceled(jobId)) throw createHttpError(499, 'AI job canceled')
      try {
        const result = await task()
        scheduler.reportSuccess()
        return result
      } catch (error) {
        lastError = error
        if (!isRetriableError(error) || attempt === MAX_CHUNK_RETRIES - 1) throw error
        scheduler.reportThrottle()
        const delayMs = retryDelayMs(attempt)
        emit(jobId, 'retry', {
          jobId,
          chunkIndex,
          attempt: attempt + 1,
          delayMs,
          error: error.message || 'AI request failed',
          dynamicConcurrency: scheduler.dynamicLimit,
        })
        persistProgress(jobId, {
          retrying: true,
          retryCount: (getJob(jobId)?.progress.retryCount ?? 0) + 1,
          dynamicConcurrency: scheduler.dynamicLimit,
        })
        await delay(delayMs)
      }
    }
    throw lastError
  }

  function persistProgress(id, patch = {}) {
    const job = getJob(id)
    if (!job) return
    const progress = {
      ...job.progress,
      ...patch,
      dynamicConcurrency: scheduler.dynamicLimit,
      maxConcurrency: scheduler.maxConcurrency,
    }
    updateJob(id, { progress })
    emit(id, 'progress', progress)
  }

  function appendResults(id, items, progressPatch = {}) {
    const job = getJob(id)
    if (!job) return
    const result = [...job.result, ...items]
    const progress = { ...job.progress, ...progressPatch }
    updateJob(id, { result, progress })
  }

  function completeJob(id, status, progressPatch = {}) {
    const job = getJob(id)
    if (!job) return
    const progress = { ...job.progress, ...progressPatch, status }
    updateJob(id, {
      status,
      progress,
      completedAt: Date.now(),
    })
    emit(id, 'done', donePayload(getJob(id)))
  }

  function failJob(id, error) {
    const status = isCanceled(id) ? 'canceled' : 'failed'
    updateJob(id, {
      status,
      errorMessage: error.message || 'AI job failed',
      completedAt: Date.now(),
      progress: {
        ...(getJob(id)?.progress ?? {}),
        status,
      },
    })
    if (status === 'failed') {
      emit(id, 'error', { jobId: id, error: error.message || 'AI job failed', ...(getJob(id)?.progress ?? {}) })
    } else {
      emit(id, 'done', donePayload(getJob(id)))
    }
  }

  function updateJob(id, patch = {}) {
    const current = getJob(id)
    if (!current) return
    const next = {
      status: patch.status ?? current.status,
      payload: patch.payload ?? current.payload,
      progress: patch.progress ?? current.progress,
      result: patch.result ?? current.result,
      errorMessage: patch.errorMessage ?? current.errorMessage,
      startedAt: patch.startedAt ?? current.startedAt,
      completedAt: patch.completedAt ?? current.completedAt,
      updatedAt: Date.now(),
    }
    db.prepare(`
      UPDATE ai_jobs
      SET status = ?,
        payload_json = ?,
        progress_json = ?,
        result_json = ?,
        error_message = ?,
        started_at = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      next.status,
      stringifyJson(next.payload),
      stringifyJson(next.progress),
      stringifyJson(next.result),
      next.errorMessage,
      next.startedAt,
      next.completedAt,
      next.updatedAt,
      id,
    )
  }

  function emit(jobId, event, data) {
    const listeners = subscribers.get(jobId)
    if (!listeners?.size) return
    for (const listener of listeners) listener(event, data)
  }

  function isCanceled(id) {
    if (canceled.has(id)) return true
    const row = db.prepare('SELECT cancel_requested FROM ai_jobs WHERE id = ?').get(id)
    return Boolean(row?.cancel_requested)
  }

  return {
    createJob,
    getJob,
    cancelJob,
    subscribe,
    replay,
    scheduler,
  }
}

export class AiRequestScheduler {
  constructor({ defaultConcurrency = DEFAULT_CONCURRENCY, maxConcurrency = MAX_CONCURRENCY } = {}) {
    this.defaultConcurrency = clampNumber(defaultConcurrency, 1, maxConcurrency)
    this.maxConcurrency = clampNumber(maxConcurrency, this.defaultConcurrency, MAX_CONCURRENCY)
    this.dynamicLimit = this.defaultConcurrency
    this.active = 0
    this.queue = []
    this.successStreak = 0
  }

  schedule(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.drain()
    })
  }

  drain() {
    while (this.active < this.dynamicLimit && this.queue.length) {
      const item = this.queue.shift()
      this.active += 1
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1
          this.drain()
        })
    }
  }

  reportThrottle() {
    this.successStreak = 0
    this.dynamicLimit = Math.max(1, Math.floor(this.dynamicLimit / 2))
  }

  reportSuccess() {
    this.successStreak += 1
    if (this.successStreak >= this.dynamicLimit && this.dynamicLimit < this.maxConcurrency) {
      this.dynamicLimit += 1
      this.successStreak = 0
      this.drain()
    }
  }
}

function mapJob(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: parseJson(row.payload_json, {}),
    progress: parseJson(row.progress_json, {}),
    result: parseJson(row.result_json, []),
    errorMessage: row.error_message ?? '',
    cancelRequested: Boolean(row.cancel_requested),
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }
}

function normalizeJobPayload(type, input) {
  if (type === 'generate_vocab') {
    return {
      language: cleanText(input.language, 40),
      topic: cleanText(input.topic ?? input.idea, 300),
      level: cleanText(input.level, 20) || '初级',
      scenario: cleanText(input.scenario, 120),
      wordCount: clampNumber(input.wordCount ?? input.count ?? 20, 5, MAX_GENERATED_WORDS),
      bookName: cleanText(input.bookName, 80),
      mode: input.mode === 'chat' ? 'chat' : 'quick',
      retrievalEnabled: Boolean(input.retrievalEnabled),
      conversation: Array.isArray(input.conversation) ? input.conversation : [],
      researchSources: Array.isArray(input.researchSources) ? input.researchSources : [],
      existingWords: normalizeExistingWords(input.existingWords),
    }
  }

  return {
    bookId: cleanText(input.bookId, 80),
  }
}

function initialProgress(type, payload, scheduler) {
  const requestedCount = type === 'generate_vocab'
    ? payload.wordCount
    : 0
  return {
    status: 'queued',
    requestedCount,
    generatedCount: 0,
    repairedCount: 0,
    generatedBatches: 0,
    totalBatches: estimateUiBatches(requestedCount),
    currentBatch: 0,
    requestedBatchSize: type === 'generate_vocab' ? GENERATE_ACCEPT_SIZE : REPAIR_REQUEST_SIZE,
    activeRequests: 0,
    completedRequests: 0,
    retryCount: 0,
    retrying: false,
    dynamicConcurrency: scheduler.dynamicLimit,
    maxConcurrency: scheduler.maxConcurrency,
  }
}

function startPayload(job) {
  return {
    jobId: job.id,
    type: job.type,
    ...job.progress,
    requestedCount: job.progress.requestedCount ?? job.payload.wordCount ?? 0,
    generatedCount: job.result.length,
  }
}

function batchPayload(job, words, generatedBatches) {
  return {
    jobId: job.id,
    type: job.type,
    draftId: job.payload.draftId || job.id,
    provider: 'deepseek',
    profile: job.payload,
    words,
    createdAt: job.createdAt,
    ...job.progress,
    generatedBatches,
    generatedCount: Math.min(job.result.length, job.progress.requestedCount || job.result.length),
    repairedCount: job.type === 'repair_words' ? job.result.length : undefined,
  }
}

function donePayload(job) {
  return {
    jobId: job.id,
    type: job.type,
    status: job.status,
    ...job.progress,
    requestedCount: job.progress.requestedCount ?? job.payload.wordCount ?? 0,
    generatedCount: job.type === 'generate_vocab' ? job.result.length : job.progress.generatedCount,
    repairedCount: job.type === 'repair_words' ? job.result.length : undefined,
    stoppedReason: job.progress.stoppedReason ?? '',
  }
}

function buildConcurrentBatchFocus(payload, requestIndex, requestedCount) {
  const themes = [
    'high-frequency core words and phrases',
    'exam recognition and reading vocabulary',
    'collocations and fixed chunks',
    'verbs and action phrases',
    'abstract academic words',
    'daily communication expressions',
    'less obvious but useful long-tail entries',
    'review-friendly contrastive expressions',
  ]
  return [
    `Generate one independent chunk for a ${requestedCount}-entry vocabulary book.`,
    `Chunk index: ${requestIndex}. Focus: ${themes[(requestIndex - 1) % themes.length]}.`,
    payload.scenario ? `Scenario: ${payload.scenario}.` : '',
    'Avoid duplicates from existingWords and from obvious previous chunks. Return more candidates than needed if possible.',
  ].filter(Boolean).join(' ')
}

function uniqueNewWords(existing, incoming) {
  const seen = new Set(existing.map((word) => normalizeTermKey(word.word)))
  const accepted = []
  for (const word of Array.isArray(incoming) ? incoming : []) {
    const key = normalizeTermKey(word.word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    accepted.push(word)
  }
  return accepted
}

function chunkItems(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function normalizeExistingWords(words) {
  const seen = new Set()
  const normalized = []
  for (const value of Array.isArray(words) ? words : []) {
    const word = cleanText(value, 80)
    const key = normalizeTermKey(word)
    if (!word || seen.has(key)) continue
    seen.add(key)
    normalized.push(word)
  }
  return normalized.slice(-500)
}

function estimateUiBatches(total) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / UI_BATCH_SIZE))
}

function isRetriableError(error) {
  const status = Number(error?.status)
  return status === 429 || status === 503 || status === 500
}

function isFatalError(error) {
  return Number(error?.status) === 402
}

function retryDelayMs(attempt) {
  return Math.min(12000, 800 * 2 ** attempt + Math.floor(Math.random() * 400))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanText(value, limit) {
  const text = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
  return text.length > limit ? text.slice(0, limit) : text
}

function normalizeTermKey(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null)
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.round(number)))
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}
