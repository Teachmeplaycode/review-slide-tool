import crypto from 'node:crypto'
import path from 'node:path'
import { getActiveAiSettings } from './apiSettingsService.mjs'
import { adaptVocabularyWithDeepSeek } from './aiProviders/deepseek.mjs'
import { extractTextFromFile } from './fileTextExtractor.mjs'

const TARGET_MODES = new Set(['new_book', 'merge_current'])
const POS_PATTERN = /^(n|v|adj|adv|prep|conj|pron|num|abbr)\.?$/i

export async function importVocabulary(db, input, options = {}) {
  const targetMode = TARGET_MODES.has(input.targetMode) ? input.targetMode : 'new_book'
  const aiAdapter = options.aiAdapter ?? adaptVocabularyWithDeepSeek
  const context = {
    sourceFile: input.file?.originalname ?? 'uploaded file',
    targetBookId: input.bookId || '',
    mode: targetMode,
    provider: 'local',
    rawTextLength: 0,
  }

  try {
    const extracted = await extractTextFromFile(input.file)
    context.sourceFile = extracted.sourceFile
    context.rawTextLength = extracted.text.length

    if (!extracted.text) {
      throw createHttpError(400, '文件中没有可导入的文本')
    }

    const aiSettings = getActiveAiSettings(db)
    context.provider = aiSettings ? 'deepseek' : 'local'
    const rawEntries = aiSettings
      ? await runAiAdapter(aiAdapter, extracted.text, extracted.sourceFile, aiSettings)
      : parseVocabularyText(extracted.text)

    const entries = normalizeImportedWords(rawEntries)
    if (!entries.length) {
      throw createHttpError(400, context.provider === 'deepseek' ? 'AI 未返回有效词条' : '未从文本中识别到有效词条')
    }

    const book = resolveTargetBook(db, {
      targetMode,
      bookId: input.bookId,
      bookName: input.bookName || titleFromFileName(extracted.sourceFile),
    })
    context.targetBookId = book.id

    const importResult = insertImportedWords(db, book.id, entries)
    const summaryBook = getBookSummary(db, book.id)
    const job = recordImportJob(db, {
      ...context,
      status: 'success',
      importedCount: importResult.importedCount,
      skippedCount: importResult.skippedCount,
      errorMessage: '',
    })

    return {
      job,
      book: summaryBook,
      importedCount: importResult.importedCount,
      skippedCount: importResult.skippedCount,
      rawTextLength: context.rawTextLength,
      sourceFile: extracted.sourceFile,
      provider: context.provider,
      usedAi: context.provider === 'deepseek',
      targetMode,
      previewWords: importResult.previewWords,
    }
  } catch (error) {
    recordImportJob(db, {
      ...context,
      status: 'failed',
      importedCount: 0,
      skippedCount: 0,
      errorMessage: error.message || '导入失败',
    })
    throw error
  }
}

export function parseVocabularyText(text) {
  const entries = []
  entries.push(...parseMarkdownRows(text))

  for (const line of String(text).split('\n')) {
    const entry = parseTextLine(line)
    if (entry) entries.push(entry)
  }

  return entries
}

export function normalizeImportedWords(rawEntries) {
  const entries = []
  const seen = new Set()

  for (const raw of rawEntries ?? []) {
    const entry = normalizeEntry(raw)
    if (!entry) continue
    const key = entry.word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }

  return entries
}

function runAiAdapter(aiAdapter, text, sourceFile, settings) {
  return aiAdapter({
    text,
    sourceFile,
    settings,
  })
}

function resolveTargetBook(db, { targetMode, bookId, bookName }) {
  if (targetMode === 'merge_current') {
    const book = db.prepare('SELECT * FROM word_books WHERE id = ?').get(bookId)
    if (!book) throw createHttpError(404, '目标词库不存在')
    return mapBookRow(book)
  }

  const now = Date.now()
  const name = cleanBookName(bookName)
  const id = createId('book')
  db.prepare(`
    INSERT INTO word_books (id, name, description, language, created_at, updated_at)
    VALUES (?, ?, ?, 'en', ?, ?)
  `).run(id, name, `由文件导入生成：${name}`, now, now)

  return getBookSummary(db, id)
}

function insertImportedWords(db, bookId, entries) {
  const now = Date.now()
  const existing = new Set(
    db.prepare('SELECT LOWER(word) AS word FROM words WHERE book_id = ?').all(bookId).map((row) => row.word),
  )
  const accepted = []
  let skippedCount = 0

  for (const entry of entries) {
    const key = entry.word.toLowerCase()
    if (existing.has(key)) {
      skippedCount += 1
      continue
    }
    existing.add(key)
    accepted.push(entry)
  }

  const insert = db.prepare(`
    INSERT INTO words (
      id,
      book_id,
      word,
      phonetic,
      part_of_speech,
      meaning_zh,
      example_en,
      example_zh,
      tags,
      difficulty,
      enabled,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (const entry of accepted) {
      insert.run(
        createId('word'),
        bookId,
        entry.word,
        entry.phonetic,
        entry.partOfSpeech,
        entry.meaningZh,
        entry.exampleEn,
        entry.exampleZh,
        entry.tags,
        entry.difficulty,
        now,
        now,
      )
    }

    db.prepare('UPDATE word_books SET updated_at = ? WHERE id = ?').run(now, bookId)
  })
  tx()

  return {
    importedCount: accepted.length,
    skippedCount,
    previewWords: accepted.slice(0, 12),
  }
}

function recordImportJob(db, job) {
  const id = createId('import')
  const row = {
    id,
    source_file: job.sourceFile || 'uploaded file',
    target_book_id: job.targetBookId || '',
    mode: job.mode || 'new_book',
    provider: job.provider || 'local',
    status: job.status,
    raw_text_length: job.rawTextLength ?? 0,
    imported_count: job.importedCount ?? 0,
    skipped_count: job.skippedCount ?? 0,
    error_message: job.errorMessage ?? '',
    created_at: Date.now(),
  }

  db.prepare(`
    INSERT INTO import_jobs (
      id,
      source_file,
      target_book_id,
      mode,
      provider,
      status,
      raw_text_length,
      imported_count,
      skipped_count,
      error_message,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.source_file,
    row.target_book_id,
    row.mode,
    row.provider,
    row.status,
    row.raw_text_length,
    row.imported_count,
    row.skipped_count,
    row.error_message,
    row.created_at,
  )

  return mapImportJob(row)
}

function parseMarkdownRows(text) {
  const rows = []

  for (const line of String(text).split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
    if (cells.length < 2) continue
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue
    if (cells.some((cell) => /^(word|单词|英文|meaning|释义|中文)$/i.test(cell))) continue

    const [word, second, third, fourth, fifth, sixth, seventh, eighth] = cells
    if (!looksLikeEnglishWord(word)) continue

    const hasPhonetic = looksLikePhonetic(second)
    const hasPartOfSpeech = POS_PATTERN.test(hasPhonetic ? third : second)

    rows.push({
      word,
      phonetic: hasPhonetic ? second : '',
      partOfSpeech: hasPartOfSpeech ? (hasPhonetic ? third : second) : '',
      meaningZh: hasPhonetic && hasPartOfSpeech ? fourth : hasPhonetic ? third : hasPartOfSpeech ? third : second,
      exampleEn: hasPhonetic && hasPartOfSpeech ? fifth : fourth,
      exampleZh: hasPhonetic && hasPartOfSpeech ? sixth : fifth,
      tags: hasPhonetic && hasPartOfSpeech ? seventh : sixth,
      difficulty: hasPhonetic && hasPartOfSpeech ? eighth : seventh,
    })
  }

  return rows
}

function parseTextLine(line) {
  const cleaned = String(line)
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')

  if (!cleaned || cleaned.includes('|')) return null

  const separated = cleaned.match(/^([A-Za-z][A-Za-z\s'-]{0,80}?)(?:\s+(\/[^/]+\/|\[[^\]]+\]))?(?:\s+((?:n|v|adj|adv|prep|conj|pron|num|abbr)\.?))?\s*(?:[-—–:：\t])\s*(.+)$/i)
  if (separated) {
    return {
      word: separated[1],
      phonetic: separated[2] ?? '',
      partOfSpeech: separated[3] ?? '',
      meaningZh: separated[4],
    }
  }

  const spaced = cleaned.match(/^([A-Za-z][A-Za-z'-]{1,60})(?:\s+(\/[^/]+\/|\[[^\]]+\]))?\s+((?:n|v|adj|adv|prep|conj|pron|num|abbr)\.?)\s+(.+)$/i)
  if (spaced) {
    return {
      word: spaced[1],
      phonetic: spaced[2] ?? '',
      partOfSpeech: spaced[3],
      meaningZh: spaced[4],
    }
  }

  return null
}

function normalizeEntry(raw) {
  const word = cleanWord(raw.word)
  const meaningZh = stringValue(raw.meaningZh ?? raw.meaning ?? raw.translation).trim()

  if (!looksLikeEnglishWord(word) || !meaningZh) return null

  return {
    word,
    phonetic: stringValue(raw.phonetic).trim(),
    partOfSpeech: normalizePartOfSpeech(raw.partOfSpeech ?? raw.pos),
    meaningZh,
    exampleEn: stringValue(raw.exampleEn).trim(),
    exampleZh: stringValue(raw.exampleZh).trim(),
    tags: stringValue(raw.tags).trim(),
    difficulty: clampNumber(raw.difficulty ?? 1, 1, 5),
  }
}

function getBookSummary(db, bookId) {
  const row = db.prepare(`
    SELECT
      b.*,
      COUNT(w.id) AS word_count,
      COUNT(CASE WHEN p.attempts > 0 THEN 1 END) AS learned_count,
      COUNT(CASE WHEN p.word_id IS NOT NULL AND (p.last_correct = 0 OR p.mastery < 3) THEN 1 END) AS review_count
    FROM word_books b
    LEFT JOIN words w ON w.book_id = b.id AND w.enabled = 1
    LEFT JOIN word_progress p ON p.word_id = w.id
    WHERE b.id = ?
    GROUP BY b.id
  `).get(bookId)

  if (!row) throw createHttpError(404, '词库不存在')
  return mapBookRow(row)
}

function mapBookRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    language: row.language,
    wordCount: row.word_count ?? 0,
    learnedCount: row.learned_count ?? 0,
    reviewCount: row.review_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapImportJob(row) {
  return {
    id: row.id,
    sourceFile: row.source_file,
    targetBookId: row.target_book_id,
    mode: row.mode,
    provider: row.provider,
    status: row.status,
    rawTextLength: row.raw_text_length,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

function cleanWord(value) {
  return stringValue(value)
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
}

function cleanBookName(value) {
  const name = stringValue(value).trim().replace(/\s+/g, ' ')
  return name || '导入词库'
}

function titleFromFileName(fileName) {
  return path.basename(String(fileName || '导入词库'), path.extname(String(fileName || '')))
}

function normalizePartOfSpeech(value) {
  const text = stringValue(value).trim()
  if (!text) return ''
  return text.endsWith('.') ? text : `${text}.`
}

function looksLikeEnglishWord(value) {
  return /^[A-Za-z][A-Za-z\s'-]{0,80}$/.test(String(value).trim())
}

function looksLikePhonetic(value) {
  return /^\/.+\/$/.test(String(value ?? '').trim()) || /^\[.+\]$/.test(String(value ?? '').trim())
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.round(number)))
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
