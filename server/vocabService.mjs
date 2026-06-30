import crypto from 'node:crypto'
import { BASIC_BOOK_ID } from './seedWords.mjs'
import { mapBook, mapWord } from './db.mjs'

export const STUDY_MODES = new Set(['recognition', 'spelling', 'mixed'])

export function listBooks(db) {
  return db.prepare(`
    SELECT
      b.*,
      COUNT(w.id) AS word_count,
      COUNT(CASE WHEN p.attempts > 0 THEN 1 END) AS learned_count,
      COUNT(CASE WHEN p.word_id IS NOT NULL AND (p.last_correct = 0 OR p.mastery < 3) THEN 1 END) AS review_count
    FROM word_books b
    LEFT JOIN words w ON w.book_id = b.id AND w.enabled = 1
    LEFT JOIN word_progress p ON p.word_id = w.id
    GROUP BY b.id
    ORDER BY b.updated_at DESC
  `).all().map(mapBook)
}

export function listWords(db, bookId, options = {}) {
  const limit = clampNumber(options.limit ?? 50, 1, 200)
  const offset = Math.max(0, Number(options.offset ?? 0) || 0)
  const query = String(options.query ?? '').trim()
  const params = { bookId, limit, offset, query: `%${query}%` }

  const rows = db.prepare(`
    SELECT
      w.*,
      p.attempts,
      p.correct_count,
      p.wrong_count,
      p.mastery,
      p.last_correct,
      p.last_answer,
      p.last_studied_at,
      p.updated_at AS progress_updated_at
    FROM words w
    LEFT JOIN word_progress p ON p.word_id = w.id
    WHERE w.book_id = @bookId
      AND w.enabled = 1
      AND (@query = '%%' OR w.word LIKE @query OR w.meaning_zh LIKE @query OR w.tags LIKE @query)
    ORDER BY LOWER(w.word)
    LIMIT @limit OFFSET @offset
  `).all(params)

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM words
    WHERE book_id = @bookId
      AND enabled = 1
      AND (@query = '%%' OR word LIKE @query OR meaning_zh LIKE @query OR tags LIKE @query)
  `).get(params).total

  return { words: rows.map(mapWord), total, limit, offset }
}

export function createWord(db, bookId, input) {
  const payload = normalizeWordInput(input)
  const now = Date.now()
  const id = createId('word')

  db.prepare(`
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
  `).run(
    id,
    bookId,
    payload.word,
    payload.phonetic,
    payload.partOfSpeech,
    payload.meaningZh,
    payload.exampleEn,
    payload.exampleZh,
    payload.tags,
    payload.difficulty,
    now,
    now,
  )

  return getWordById(db, id)
}

export function updateWord(db, wordId, input) {
  const current = db.prepare('SELECT * FROM words WHERE id = ? AND enabled = 1').get(wordId)
  if (!current) return null

  const next = {
    word: stringValue(input.word, current.word).trim(),
    phonetic: stringValue(input.phonetic, current.phonetic).trim(),
    partOfSpeech: stringValue(input.partOfSpeech, current.part_of_speech).trim(),
    meaningZh: stringValue(input.meaningZh, current.meaning_zh).trim(),
    exampleEn: stringValue(input.exampleEn, current.example_en).trim(),
    exampleZh: stringValue(input.exampleZh, current.example_zh).trim(),
    tags: stringValue(input.tags, current.tags).trim(),
    difficulty: clampNumber(input.difficulty ?? current.difficulty, 1, 5),
  }

  if (!next.word || !next.meaningZh) {
    throw createHttpError(400, '单词和中文释义不能为空')
  }

  db.prepare(`
    UPDATE words
    SET word = ?,
      phonetic = ?,
      part_of_speech = ?,
      meaning_zh = ?,
      example_en = ?,
      example_zh = ?,
      tags = ?,
      difficulty = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    next.word,
    next.phonetic,
    next.partOfSpeech,
    next.meaningZh,
    next.exampleEn,
    next.exampleZh,
    next.tags,
    next.difficulty,
    Date.now(),
    wordId,
  )

  return getWordById(db, wordId)
}

export function disableWord(db, wordId) {
  const result = db.prepare('UPDATE words SET enabled = 0, updated_at = ? WHERE id = ?').run(Date.now(), wordId)
  return result.changes > 0
}

export function startStudySession(db, input) {
  const bookId = stringValue(input.bookId, BASIC_BOOK_ID)
  const mode = STUDY_MODES.has(input.mode) ? input.mode : 'mixed'
  const count = clampNumber(input.count ?? 10, 1, 50)
  const reviewOnly = Boolean(input.reviewOnly)

  const book = db.prepare('SELECT id FROM word_books WHERE id = ?').get(bookId)
  if (!book) throw createHttpError(404, '词库不存在')

  const pool = loadStudyPool(db, bookId, reviewOnly)
  if (!pool.length) {
    throw createHttpError(400, reviewOnly ? '当前没有需要复习的错词' : '当前词库没有可学习单词')
  }

  const picked = shuffle(pool).slice(0, Math.min(count, pool.length))
  const allWords = db.prepare('SELECT id, meaning_zh FROM words WHERE book_id = ? AND enabled = 1').all(bookId)
  const items = picked.map((word, index) => buildStudyItem(word, resolveItemMode(mode, index), allWords))
  const now = Date.now()
  const session = {
    id: createId('session'),
    bookId,
    mode,
    totalCount: items.length,
    correctCount: 0,
    wrongCount: 0,
    createdAt: now,
  }

  db.prepare(`
    INSERT INTO study_sessions (id, book_id, mode, total_count, correct_count, wrong_count, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `).run(session.id, session.bookId, session.mode, session.totalCount, session.createdAt)

  return { session, items }
}

export function submitStudyAnswer(db, sessionId, input) {
  const session = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId)
  if (!session) throw createHttpError(404, '学习会话不存在')

  const word = db.prepare('SELECT * FROM words WHERE id = ? AND enabled = 1').get(input.wordId)
  if (!word) throw createHttpError(404, '单词不存在')

  const mode = input.mode === 'spelling' ? 'spelling' : 'recognition'
  const userAnswer = String(input.userAnswer ?? '')
  const correctAnswer = mode === 'spelling' ? word.word : word.meaning_zh
  const correct = mode === 'spelling'
    ? normalizeEnglish(userAnswer) === normalizeEnglish(word.word)
    : normalizeText(userAnswer) === normalizeText(word.meaning_zh)
  const now = Date.now()

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO study_answers (
        id,
        session_id,
        word_id,
        mode,
        user_answer,
        correct_answer,
        is_correct,
        answered_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(createId('answer'), sessionId, word.id, mode, userAnswer.trim(), correctAnswer, correct ? 1 : 0, now)

    const previous = db.prepare('SELECT * FROM word_progress WHERE word_id = ?').get(word.id)
    const mastery = clampNumber((previous?.mastery ?? 0) + (correct ? 1 : -1), 0, 5)
    const progressId = previous?.id ?? createId('progress')

    db.prepare(`
      INSERT INTO word_progress (
        id,
        word_id,
        attempts,
        correct_count,
        wrong_count,
        mastery,
        last_correct,
        last_answer,
        last_studied_at,
        updated_at
      )
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(word_id) DO UPDATE SET
        attempts = attempts + 1,
        correct_count = correct_count + excluded.correct_count,
        wrong_count = wrong_count + excluded.wrong_count,
        mastery = excluded.mastery,
        last_correct = excluded.last_correct,
        last_answer = excluded.last_answer,
        last_studied_at = excluded.last_studied_at,
        updated_at = excluded.updated_at
    `).run(
      progressId,
      word.id,
      correct ? 1 : 0,
      correct ? 0 : 1,
      mastery,
      correct ? 1 : 0,
      userAnswer.trim(),
      now,
      now,
    )

    db.prepare(`
      UPDATE study_sessions
      SET correct_count = correct_count + ?,
        wrong_count = wrong_count + ?
      WHERE id = ?
    `).run(correct ? 1 : 0, correct ? 0 : 1, sessionId)
  })

  tx()

  return {
    correct,
    userAnswer: userAnswer.trim(),
    correctAnswer,
    word: mapWord({
      ...word,
      attempts: null,
      correct_count: null,
      wrong_count: null,
      mastery: null,
      last_correct: null,
      last_answer: null,
      last_studied_at: null,
      progress_updated_at: null,
    }),
    progress: getProgress(db, word.id),
    session: getSession(db, sessionId),
  }
}

export function getOverview(db, bookId = BASIC_BOOK_ID) {
  const row = db.prepare(`
    SELECT
      COUNT(w.id) AS total_words,
      COUNT(CASE WHEN p.attempts > 0 THEN 1 END) AS learned_words,
      COUNT(CASE WHEN p.word_id IS NOT NULL AND (p.last_correct = 0 OR p.mastery < 3) THEN 1 END) AS review_words,
      COALESCE(ROUND(AVG(CASE WHEN p.word_id IS NOT NULL THEN p.mastery END), 2), 0) AS average_mastery,
      COALESCE(SUM(p.attempts), 0) AS total_attempts,
      COALESCE(SUM(p.correct_count), 0) AS correct_count,
      COALESCE(SUM(p.wrong_count), 0) AS wrong_count
    FROM words w
    LEFT JOIN word_progress p ON p.word_id = w.id
    WHERE w.book_id = ? AND w.enabled = 1
  `).get(bookId)

  return {
    bookId,
    totalWords: row.total_words,
    learnedWords: row.learned_words,
    reviewWords: row.review_words,
    averageMastery: row.average_mastery,
    totalAttempts: row.total_attempts,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
  }
}

export function getSessionAnswers(db, sessionId) {
  return db.prepare(`
    SELECT
      a.id,
      a.session_id,
      a.word_id,
      a.mode,
      a.user_answer,
      a.correct_answer,
      a.is_correct,
      a.answered_at,
      w.word,
      w.phonetic,
      w.part_of_speech,
      w.meaning_zh,
      w.example_en,
      w.example_zh
    FROM study_answers a
    INNER JOIN words w ON w.id = a.word_id
    WHERE a.session_id = ?
    ORDER BY a.answered_at ASC
  `).all(sessionId).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    wordId: row.word_id,
    mode: row.mode,
    userAnswer: row.user_answer,
    correctAnswer: row.correct_answer,
    correct: Boolean(row.is_correct),
    answeredAt: row.answered_at,
    word: {
      id: row.word_id,
      word: row.word,
      phonetic: row.phonetic,
      partOfSpeech: row.part_of_speech,
      meaningZh: row.meaning_zh,
      exampleEn: row.example_en,
      exampleZh: row.example_zh,
    },
  }))
}

export function getSession(db, sessionId) {
  const row = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId)
  if (!row) return null

  return {
    id: row.id,
    bookId: row.book_id,
    mode: row.mode,
    totalCount: row.total_count,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    createdAt: row.created_at,
  }
}

function getWordById(db, wordId) {
  const row = db.prepare(`
    SELECT
      w.*,
      p.attempts,
      p.correct_count,
      p.wrong_count,
      p.mastery,
      p.last_correct,
      p.last_answer,
      p.last_studied_at,
      p.updated_at AS progress_updated_at
    FROM words w
    LEFT JOIN word_progress p ON p.word_id = w.id
    WHERE w.id = ?
  `).get(wordId)

  return row ? mapWord(row) : null
}

function getProgress(db, wordId) {
  const row = db.prepare('SELECT * FROM word_progress WHERE word_id = ?').get(wordId)
  return {
    attempts: row?.attempts ?? 0,
    correctCount: row?.correct_count ?? 0,
    wrongCount: row?.wrong_count ?? 0,
    mastery: row?.mastery ?? 0,
    lastCorrect: row?.last_correct === null || row?.last_correct === undefined ? null : Boolean(row.last_correct),
    lastAnswer: row?.last_answer ?? '',
    lastStudiedAt: row?.last_studied_at ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

function loadStudyPool(db, bookId, reviewOnly) {
  const sql = `
    SELECT
      w.*,
      p.attempts,
      p.correct_count,
      p.wrong_count,
      p.mastery,
      p.last_correct,
      p.last_answer,
      p.last_studied_at,
      p.updated_at AS progress_updated_at
    FROM words w
    LEFT JOIN word_progress p ON p.word_id = w.id
    WHERE w.book_id = ?
      AND w.enabled = 1
      ${reviewOnly ? 'AND p.word_id IS NOT NULL AND (p.last_correct = 0 OR p.mastery < 3)' : ''}
    ORDER BY COALESCE(p.mastery, 0) ASC, LOWER(w.word)
  `

  return db.prepare(sql).all(bookId).map(mapWord)
}

function buildStudyItem(word, mode, allWords) {
  return {
    id: createId('item'),
    wordId: word.id,
    mode,
    prompt: mode === 'spelling' ? word.meaningZh : word.word,
    word: {
      id: word.id,
      word: word.word,
      phonetic: word.phonetic,
      partOfSpeech: word.partOfSpeech,
      meaningZh: word.meaningZh,
      exampleEn: word.exampleEn,
      exampleZh: word.exampleZh,
    },
    choices: mode === 'recognition' ? buildChoices(word, allWords) : [],
  }
}

function buildChoices(word, allWords) {
  const distractors = shuffle(
    allWords
      .filter((item) => item.id !== word.id && item.meaning_zh !== word.meaningZh)
      .map((item) => item.meaning_zh),
  ).slice(0, 3)

  return shuffle([word.meaningZh, ...distractors])
}

function resolveItemMode(mode, index) {
  if (mode === 'mixed') return index % 2 === 0 ? 'recognition' : 'spelling'
  return mode
}

function normalizeWordInput(input) {
  const word = stringValue(input.word).trim()
  const meaningZh = stringValue(input.meaningZh).trim()

  if (!word || !meaningZh) {
    throw createHttpError(400, '单词和中文释义不能为空')
  }

  return {
    word,
    meaningZh,
    phonetic: stringValue(input.phonetic).trim(),
    partOfSpeech: stringValue(input.partOfSpeech).trim(),
    exampleEn: stringValue(input.exampleEn).trim(),
    exampleZh: stringValue(input.exampleZh).trim(),
    tags: stringValue(input.tags).trim(),
    difficulty: clampNumber(input.difficulty ?? 1, 1, 5),
  }
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

function normalizeEnglish(value) {
  return String(value).trim().toLowerCase()
}

function normalizeText(value) {
  return String(value).trim().replace(/\s+/g, ' ')
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.round(number)))
}

function shuffle(items) {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }

  return copy
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
