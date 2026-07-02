import crypto from 'node:crypto'
import { getAiSettingsWithKey, getSearchSettingsWithKey } from './apiSettingsService.mjs'
import { generateVocabularyDraftWithDeepSeek, planVocabularyProfileWithDeepSeek } from './aiProviders/deepseek.mjs'
import { searchVocabularyContextWithTavily } from './searchProviders/tavily.mjs'
import { createHttpError, createVocabularyBookFromEntries, normalizeImportedWords } from './vocabImportService.mjs'

const LEVELS = new Set(['入门', '初级', '中级', '高级', '专业'])
const MAX_GENERATED_WORDS = 5000
const MIN_TOPIC_LENGTH = 2

export async function generateVocabularyDraft(db, input = {}, options = {}) {
  const settings = getAiSettingsWithKey(db)
  if (!settings) {
    throw createHttpError(400, '需要先保存 DeepSeek API Key')
  }

  const profile = normalizeProfile(input)
  profile.existingWords = normalizeExistingWords(input.existingWords)
  const adapter = options.generatorAdapter ?? generateVocabularyDraftWithDeepSeek
  const rawWords = await adapter({ profile, settings, timeoutMs: options.timeoutMs })
  const existingKeys = new Set(profile.existingWords.map(normalizeTermKey))
  const words = normalizeImportedWords(rawWords)
    .filter((word) => !existingKeys.has(normalizeTermKey(word.word)))
    .slice(0, profile.wordCount)

  if (!words.length && !profile.existingWords.length) {
    throw createHttpError(400, 'AI 未返回有效词条')
  }

  return {
    draftId: createId('draft'),
    provider: 'deepseek',
    profile,
    words,
    createdAt: Date.now(),
  }
}

export async function planVocabularyConversation(db, input = {}, options = {}) {
  const settings = getAiSettingsWithKey(db)
  if (!settings) {
    throw createHttpError(400, '需要先保存 DeepSeek API Key')
  }

  const adapter = options.conversationAdapter ?? planVocabularyProfileWithDeepSeek
  const result = await adapter({
    conversation: normalizeConversation(input.conversation),
    draftProfile: normalizeProfileDraft(input.profile ?? input),
    settings,
  })

  return normalizeConversationPlan(result)
}

export async function researchVocabularyContext(db, input = {}, options = {}) {
  const settings = getSearchSettingsWithKey(db)
  if (!settings) {
    throw createHttpError(400, '需要先保存并启用 Tavily API Key')
  }

  const adapter = options.searchAdapter ?? searchVocabularyContextWithTavily
  const result = await adapter({
    profile: normalizeProfileDraft(input.profile ?? input),
    conversation: normalizeConversation(input.conversation),
    settings,
    maxResults: input.maxResults,
  })

  return {
    query: cleanText(result.query, 240),
    answer: cleanText(result.answer, 900),
    provider: result.provider || 'tavily',
    sources: normalizeResearchSources(result.sources),
  }
}

export function commitVocabularyDraft(db, input = {}) {
  const language = cleanText(input.language, 40) || '自定义语言'
  const bookName = cleanText(input.bookName, 80) || `${language}学习词库`
  const topic = cleanText(input.topic, 300)
  const targetMode = input.targetMode === 'merge_current' ? 'merge_current' : 'new_book'
  const description = cleanText(input.description, 200)
    || (topic ? `AI 根据「${topic}」生成的${language}学习词库` : `AI 生成的${language}学习词库`)

  return createVocabularyBookFromEntries(db, {
    targetMode,
    bookId: input.bookId,
    bookName,
    description,
    language,
    entries: input.words,
    provider: 'deepseek',
    sourceFile: topic ? `AI 生成：${topic}` : 'AI 生成词库',
  })
}

function normalizeProfile(input) {
  const language = cleanText(input.language, 40)
  const topic = cleanText(input.topic ?? input.idea, 300)
  const level = LEVELS.has(input.level) ? input.level : '初级'
  const scenario = cleanText(input.scenario, 120)
  const wordCount = clampNumber(input.wordCount ?? input.count ?? 20, 5, MAX_GENERATED_WORDS)
  const bookName = cleanText(input.bookName, 80) || defaultBookName(language, topic)

  if (!language) {
    throw createHttpError(400, '目标语言不能为空')
  }

  if (topic.length < MIN_TOPIC_LENGTH) {
    throw createHttpError(400, `请至少输入 ${MIN_TOPIC_LENGTH} 个字的学习想法`)
  }

  return {
    language,
    topic,
    level,
    scenario,
    wordCount,
    bookName,
    mode: input.mode === 'chat' ? 'chat' : 'quick',
    retrievalEnabled: Boolean(input.retrievalEnabled),
    conversation: normalizeConversation(input.conversation),
    researchSources: normalizeResearchSources(input.researchSources),
    batchIndex: clampNumber(input.batchIndex ?? 1, 1, 9999),
    batchFocus: cleanText(input.batchFocus, 500),
    generationRange: cleanText(input.generationRange, 80),
    existingWords: [],
  }
}

function normalizeProfileDraft(input = {}) {
  return {
    language: cleanText(input.language, 40),
    topic: cleanText(input.topic ?? input.idea, 300),
    level: LEVELS.has(input.level) ? input.level : '初级',
    scenario: cleanText(input.scenario, 120),
    wordCount: clampNumber(input.wordCount ?? input.count ?? 50, 5, MAX_GENERATED_WORDS),
    bookName: cleanText(input.bookName, 80),
  }
}

function normalizeConversationPlan(result = {}) {
  const profile = normalizeProfileDraft(result.profile ?? {})
  const questions = (Array.isArray(result.questions) ? result.questions : [])
    .map((item) => cleanText(item, 160))
    .filter(Boolean)
    .slice(0, 4)

  return {
    message: cleanText(result.message, 500) || (result.ready ? '已整理好生成需求。' : '我需要再确认几个细节。'),
    questions,
    ready: Boolean(result.ready && profile.language && profile.topic && profile.topic.length >= MIN_TOPIC_LENGTH),
    profile,
  }
}

function normalizeConversation(conversation) {
  return (Array.isArray(conversation) ? conversation : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item?.content, 800),
    }))
    .filter((item) => item.content)
    .slice(-20)
}

function normalizeResearchSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((source) => ({
      title: cleanText(source?.title, 120),
      url: cleanText(source?.url, 400),
      content: cleanText(source?.content ?? source?.summary, 500),
      publishedDate: cleanText(source?.publishedDate ?? source?.published_date, 40),
      score: Number.isFinite(Number(source?.score)) ? Number(source.score) : undefined,
    }))
    .filter((source) => source.title && source.url && source.content)
    .slice(0, 5)
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

  return normalized.slice(-300)
}

function normalizeTermKey(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function defaultBookName(language, topic) {
  const cleanTopic = cleanText(topic, 18)
  if (!language && !cleanTopic) return 'AI 学习词库'
  if (!cleanTopic) return `${language}学习词库`
  if (!language) return `${cleanTopic}词库`
  return `${language}-${cleanTopic}词库`
}

function cleanText(value, limit) {
  const text = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
  return text.length > limit ? text.slice(0, limit) : text
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.round(number)))
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}
