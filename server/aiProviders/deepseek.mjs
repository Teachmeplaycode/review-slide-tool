const DEFAULT_TIMEOUT_MS = 45000

export async function adaptVocabularyWithDeepSeek({ text, sourceFile, settings, fetchImpl = fetch }) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'DeepSeek API Key 未配置')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetchImpl(`${trimSlash(settings.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model || 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '你是英语词库整理助手。',
              '只返回合法 JSON，不要返回 markdown。',
              'JSON 格式必须为 {"words":[...]}。',
              '每个 word 对象字段：word, phonetic, partOfSpeech, meaningZh, exampleEn, exampleZh, tags, difficulty。',
              'difficulty 为 1 到 5 的整数；无法确定的字段用空字符串；没有中文释义的词不要输出。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `来源文件：${sourceFile || 'uploaded file'}`,
              '请从下面文本中提取适合背诵的英语单词或短语，整理成英语背单词系统可以导入的词库。',
              '优先提取有明确中文释义、例句或上下文的词条，避免重复。',
              '',
              String(text ?? ''),
            ].join('\n'),
          },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw createHttpError(response.status, payload?.error?.message || 'DeepSeek 请求失败')
    }

    const content = payload?.choices?.[0]?.message?.content
    return parseDeepSeekWords(content)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError(504, 'DeepSeek 请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateStudyExplanationsWithDeepSeek({ items, settings, fetchImpl = fetch }) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'DeepSeek API Key 未配置')
  }

  const safeItems = normalizeStudyItems(items)
  if (!safeItems.length) return []

  const content = await requestDeepSeekContent({
    settings,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你是英语背词系统的批改和解析助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"explanations":[{"itemId":"...","wordId":"...","explanation":"..."}]}。',
          'explanation 用中文，控制在 60 字以内，说明答案、词性/词义要点或一个记忆提示。',
          '不要输出长篇讲解，不要编造未提供的信息。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '请为下面这些用户本轮抽到的背词题生成简短解析，用户答题时后台会预取这些解析。',
          JSON.stringify({ items: safeItems }),
        ].join('\n'),
      },
    ],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })

  return parseStudyExplanations(content, safeItems)
}

export async function generatePhoneticsWithDeepSeek({ words, settings, fetchImpl = fetch }) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'DeepSeek API Key 未配置')
  }

  const safeWords = normalizePhoneticWords(words)
  if (!safeWords.length) return []

  const content = await requestDeepSeekContent({
    settings,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你是英语音标补全助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"phonetics":[{"wordId":"...","word":"...","phonetic":"..."}]}。',
          'phonetic 使用常见 IPA 英式音标，外层用 / / 包裹。',
          '不能确定时 phonetic 返回空字符串。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '请为下面词库中缺失音标的英语单词或短语补全音标。',
          JSON.stringify({ words: safeWords }),
        ].join('\n'),
      },
    ],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })

  return parseDeepSeekPhonetics(content, safeWords)
}

export function parseDeepSeekWords(content) {
  const raw = String(content ?? '').trim()
  if (!raw) return []

  const parsed = parseJsonContent(raw)

  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.words)) return parsed.words
  return []
}

export function parseStudyExplanations(content, items = []) {
  const parsed = parseJsonContent(content)
  const list = Array.isArray(parsed) ? parsed : parsed?.explanations
  const allowedItemIds = new Set(items.map((item) => item.itemId))
  const allowedWordIds = new Map(items.map((item) => [item.itemId, item.wordId]))

  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      itemId: stringValue(item.itemId ?? item.id).trim(),
      wordId: stringValue(item.wordId).trim(),
      explanation: truncateInline(item.explanation ?? item.analysis ?? item.detail, 220),
    }))
    .filter((item) => item.itemId && allowedItemIds.has(item.itemId) && item.explanation)
    .map((item) => ({
      ...item,
      wordId: item.wordId || allowedWordIds.get(item.itemId) || '',
    }))
}

export function parseDeepSeekPhonetics(content, words = []) {
  const parsed = parseJsonContent(content)
  const list = Array.isArray(parsed) ? parsed : (parsed?.phonetics ?? parsed?.words)
  const allowedIds = new Set(words.map((word) => word.wordId))

  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      wordId: stringValue(item.wordId ?? item.id).trim(),
      word: stringValue(item.word).trim(),
      phonetic: normalizePhonetic(item.phonetic),
    }))
    .filter((item) => item.wordId && allowedIds.has(item.wordId) && item.phonetic)
}

async function requestDeepSeekContent({ settings, fetchImpl, messages, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(`${trimSlash(settings.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model || 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages,
        temperature: 0.15,
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw createHttpError(response.status, payload?.error?.message || 'DeepSeek 请求失败')
    }

    return payload?.choices?.[0]?.message?.content ?? ''
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError(504, 'DeepSeek 请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function parseJsonContent(content) {
  const raw = String(content ?? '').trim()
  if (!raw) return null

  const jsonText = stripJsonFence(raw)

  try {
    return JSON.parse(jsonText)
  } catch {
    const fallback = extractJsonBlock(jsonText)
    return fallback ? JSON.parse(fallback) : null
  }
}

function normalizeStudyItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 50).map((item) => ({
    itemId: stringValue(item.itemId ?? item.id).trim(),
    wordId: stringValue(item.wordId).trim(),
    mode: item.mode === 'spelling' ? 'spelling' : 'recognition',
    prompt: truncateInline(item.prompt, 120),
    word: truncateInline(item.word?.word ?? item.word, 80),
    phonetic: truncateInline(item.word?.phonetic ?? item.phonetic, 80),
    partOfSpeech: truncateInline(item.word?.partOfSpeech ?? item.partOfSpeech, 40),
    meaningZh: truncateInline(item.word?.meaningZh ?? item.meaningZh, 120),
    exampleEn: truncateInline(item.word?.exampleEn ?? item.exampleEn, 180),
    exampleZh: truncateInline(item.word?.exampleZh ?? item.exampleZh, 180),
  })).filter((item) => item.itemId && item.wordId && item.word && item.meaningZh)
}

function normalizePhoneticWords(words) {
  return (Array.isArray(words) ? words : []).slice(0, 120).map((word) => ({
    wordId: stringValue(word.wordId ?? word.id).trim(),
    word: truncateInline(word.word, 80),
    meaningZh: truncateInline(word.meaningZh, 120),
    partOfSpeech: truncateInline(word.partOfSpeech, 40),
  })).filter((word) => word.wordId && word.word)
}

function normalizePhonetic(value) {
  const cleaned = stringValue(value)
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, '')

  if (!cleaned) return ''
  if ((cleaned.startsWith('/') && cleaned.endsWith('/')) || (cleaned.startsWith('[') && cleaned.endsWith(']'))) {
    return truncateInline(cleaned, 80)
  }

  return truncateInline(`/${cleaned.replace(/^\/+|\/+$/g, '')}/`, 80)
}

function stripJsonFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractJsonBlock(text) {
  const firstObject = text.indexOf('{')
  const lastObject = text.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) return text.slice(firstObject, lastObject + 1)

  const firstArray = text.indexOf('[')
  const lastArray = text.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) return text.slice(firstArray, lastArray + 1)

  return ''
}

function truncateInline(text, limit) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (value.length <= limit) return value
  return value.slice(0, limit)
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

function trimSlash(url) {
  return String(url || 'https://api.deepseek.com').replace(/\/+$/, '')
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
