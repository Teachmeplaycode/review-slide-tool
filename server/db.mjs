import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { BASIC_BOOK_ID, basicEnglishWords } from './seedWords.mjs'

const serverDir = path.dirname(fileURLToPath(import.meta.url))

export function getDefaultDbPath() {
  return process.env.VOCAB_DB_PATH || path.resolve(serverDir, '..', 'data', 'vocab.sqlite')
}

export function initializeDatabase(dbPath = getDefaultDbPath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  migrate(db)
  seedDatabase(db)
  return db
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS word_books (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'en',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL DEFAULT '',
      part_of_speech TEXT NOT NULL DEFAULT '',
      meaning_zh TEXT NOT NULL,
      example_en TEXT NOT NULL DEFAULT '',
      example_zh TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      difficulty INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES word_books(id) ON DELETE CASCADE,
      UNIQUE (book_id, word)
    );

    CREATE TABLE IF NOT EXISTS word_progress (
      id TEXT PRIMARY KEY,
      word_id TEXT NOT NULL UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      mastery INTEGER NOT NULL DEFAULT 0,
      last_correct INTEGER,
      last_answer TEXT NOT NULL DEFAULT '',
      last_studied_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES word_books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      word_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      user_answer TEXT NOT NULL DEFAULT '',
      correct_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_settings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      target_book_id TEXT,
      mode TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      raw_text_length INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_words_book_enabled ON words(book_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_words_search ON words(word, meaning_zh);
    CREATE INDEX IF NOT EXISTS idx_progress_review ON word_progress(last_correct, mastery);
    CREATE INDEX IF NOT EXISTS idx_answers_session ON study_answers(session_id);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_book ON import_jobs(target_book_id, created_at);
  `)
}

export function seedDatabase(db) {
  const now = Date.now()
  const bookExists = db.prepare('SELECT id FROM word_books WHERE id = ?').get(BASIC_BOOK_ID)

  if (!bookExists) {
    db.prepare(`
      INSERT INTO word_books (id, name, description, language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      BASIC_BOOK_ID,
      '英语基础词库',
      '课程设计内置基础英语单词，覆盖常见学习、生活、校园和表达场景。',
      'en',
      now,
      now,
    )
  }

  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (
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
    for (const item of basicEnglishWords) {
      insertWord.run(
        item.id,
        BASIC_BOOK_ID,
        item.word,
        item.phonetic,
        item.partOfSpeech,
        item.meaningZh,
        item.exampleEn,
        item.exampleZh,
        item.tags,
        item.difficulty,
        now,
        now,
      )
    }
  })

  tx()
}

export function mapBook(row) {
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

export function mapWord(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    word: row.word,
    phonetic: row.phonetic,
    partOfSpeech: row.part_of_speech,
    meaningZh: row.meaning_zh,
    exampleEn: row.example_en,
    exampleZh: row.example_zh,
    tags: row.tags,
    difficulty: row.difficulty,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: {
      attempts: row.attempts ?? 0,
      correctCount: row.correct_count ?? 0,
      wrongCount: row.wrong_count ?? 0,
      mastery: row.mastery ?? 0,
      lastCorrect: row.last_correct === null || row.last_correct === undefined ? null : Boolean(row.last_correct),
      lastAnswer: row.last_answer ?? '',
      lastStudiedAt: row.last_studied_at ?? null,
      updatedAt: row.progress_updated_at ?? null,
    },
  }
}
