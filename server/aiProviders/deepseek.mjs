const DEFAULT_TIMEOUT_MS = 45000
const MAX_GENERATED_WORDS = 5000
const MIN_TOPIC_LENGTH = 2

export async function adaptVocabularyWithDeepSeek({ text, sourceFile, language = '目标语言', settings, fetchImpl = fetch }) {
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
              '你是多语言学习词库整理助手。',
              '只返回合法 JSON，不要返回 markdown。',
              'JSON 格式必须为 {"words":[...]}。',
              '每个 word 对象字段：word, phonetic, partOfSpeech, meaningZh, exampleEn, exampleZh, tags, difficulty。',
              'word 是目标语言词条；meaningZh 和 exampleZh 使用中文；exampleEn 是目标语言例句。',
              'phonetic 可填写 IPA、假名、罗马音、拼音或常见读音提示；difficulty 为 1 到 5 的整数。',
              '无法确定的字段用空字符串；没有中文释义的词不要输出。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `目标语言：${language || '目标语言'}`,
              `来源文件：${sourceFile || 'uploaded file'}`,
              '请从下面文本中提取适合背诵的目标语言单词、短语或表达，整理成学习系统可以导入的词库。',
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

export async function generateVocabularyDraftWithDeepSeek({ profile, settings, fetchImpl = fetch, timeoutMs }) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'DeepSeek API Key 未配置')
  }

  const safeProfile = {
    language: truncateInline(profile?.language, 40) || '目标语言',
    topic: truncateInline(profile?.topic, 300),
    level: truncateInline(profile?.level, 20) || '初级',
    scenario: truncateInline(profile?.scenario, 120),
    wordCount: Math.max(5, Math.min(MAX_GENERATED_WORDS, Math.round(Number(profile?.wordCount ?? 20) || 20))),
    existingWords: normalizeExistingWordHints(profile?.existingWords),
    mode: profile?.mode === 'chat' ? '高级对话' : '快速表单',
    conversation: normalizeConversationHints(profile?.conversation),
    researchSources: normalizeResearchSourceHints(profile?.researchSources),
  }

  const content = await requestDeepSeekContent({
    settings,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你是多语言学习词库生成助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"words":[...]}。',
          '每个 word 对象字段：word, phonetic, partOfSpeech, meaningZh, exampleEn, exampleZh, tags, difficulty。',
          'word 是目标语言词条；meaningZh 和 exampleZh 使用中文；exampleEn 是目标语言例句。',
          'phonetic 可填写 IPA、假名、罗马音、拼音或常见读音提示；difficulty 为 1 到 5 的整数。',
          '词条必须贴合用户主题、学习水平和场景，避免重复，优先输出可直接背诵和练习的常用表达。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `目标语言：${safeProfile.language}`,
          `学习水平：${safeProfile.level}`,
          `用户想法：${safeProfile.topic}`,
          `使用场景：${safeProfile.scenario || '通用学习'}`,
          `需要词条数量：${safeProfile.wordCount}`,
          `生成模式：${safeProfile.mode}`,
          safeProfile.conversation.length
            ? `多轮对话摘要：${safeProfile.conversation.join('\n')}`
            : '多轮对话摘要：无',
          safeProfile.researchSources.length
            ? `实时检索参考：${safeProfile.researchSources.join('\n')}`
            : '实时检索参考：无',
          safeProfile.existingWords.length
            ? `已生成词条（不要重复）：${safeProfile.existingWords.join('、')}`
            : '已生成词条：无',
          '请生成对应的学习词库。',
        ].join('\n'),
      },
    ],
    timeoutMs: timeoutMs ?? generationTimeoutMs(safeProfile.wordCount),
  })

  return parseDeepSeekWords(content)
}

export async function planVocabularyProfileWithDeepSeek({ conversation, draftProfile = {}, settings, fetchImpl = fetch }) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'DeepSeek API Key 未配置')
  }

  const safeConversation = normalizeConversationItems(conversation)
  const safeDraft = {
    language: truncateInline(draftProfile.language, 40),
    topic: truncateInline(draftProfile.topic ?? draftProfile.idea, 300),
    level: truncateInline(draftProfile.level, 20),
    scenario: truncateInline(draftProfile.scenario, 120),
    wordCount: Math.max(5, Math.min(MAX_GENERATED_WORDS, Math.round(Number(draftProfile.wordCount ?? 50) || 50))),
    bookName: truncateInline(draftProfile.bookName, 80),
  }

  const content = await requestDeepSeekContent({
    settings,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你是多语言词库需求分析助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"message":"...","questions":["..."],"ready":true,"profile":{...}}。',
          'profile 字段：language, topic, level, scenario, wordCount, bookName。',
          'level 必须是 入门、初级、中级、高级、专业 之一。',
          '如果信息不足，ready 为 false，并提出 2 到 4 个具体追问。',
          '如果信息足够，ready 为 true，并给出可直接生成词库的 profile。',
          'message 用中文，简短说明你理解的需求或下一步。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentProfile: safeDraft,
          conversation: safeConversation,
        }),
      },
    ],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })

  return parseVocabularyPlan(content)
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
          '你是多语言词库学习系统的批改和解析助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"explanations":[{"itemId":"...","wordId":"...","explanation":"..."}]}。',
          'explanation 用中文，控制在 60 字以内，说明目标语言词条、词性/词义要点或一个记忆提示。',
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

export async function generatePhoneticsWithDeepSeek({ words, language = '目标语言', settings, fetchImpl = fetch }) {
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
          '你是多语言词库读音补全助手。',
          '只返回合法 JSON，不要返回 markdown。',
          'JSON 格式必须为 {"phonetics":[{"wordId":"...","word":"...","phonetic":"..."}]}。',
          'phonetic 可填写目标语言常用读音标注，例如 IPA、假名、罗马音、拼音或常见转写。',
          '不能确定时 phonetic 返回空字符串。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `目标语言：${language || '目标语言'}`,
          '请为下面词库中缺失读音/音标的词条补全读音提示。',
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
    if (!fallback) return null
    try {
      return JSON.parse(fallback)
    } catch {
      return null
    }
  }
}

function normalizeExistingWordHints(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => truncateInline(word, 80))
    .filter(Boolean)
    .slice(-300)
}

function normalizeConversationHints(conversation) {
  return normalizeConversationItems(conversation)
    .slice(-8)
    .map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}：${item.content}`)
}

function normalizeConversationItems(conversation) {
  return (Array.isArray(conversation) ? conversation : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: truncateInline(item?.content, 500),
    }))
    .filter((item) => item.content)
    .slice(-12)
}

function normalizeResearchSourceHints(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((source, index) => {
      const title = truncateInline(source?.title, 120)
      const content = truncateInline(source?.content ?? source?.summary, 400)
      const url = truncateInline(source?.url, 240)
      return `${index + 1}. ${title}${url ? ` ${url}` : ''}${content ? ` - ${content}` : ''}`
    })
    .filter(Boolean)
    .slice(0, 5)
}

function parseVocabularyPlan(content) {
  const parsed = parseJsonContent(content) ?? {}
  const profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {}
  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((item) => truncateInline(item, 160))
    .filter(Boolean)
    .slice(0, 4)
  const normalizedProfile = {
    language: truncateInline(profile.language, 40),
    topic: truncateInline(profile.topic ?? profile.idea, 300),
    level: normalizeLevel(profile.level),
    scenario: truncateInline(profile.scenario, 120),
    wordCount: Math.max(5, Math.min(MAX_GENERATED_WORDS, Math.round(Number(profile.wordCount ?? 50) || 50))),
    bookName: truncateInline(profile.bookName, 80),
  }
  const hasRequiredProfile = Boolean(normalizedProfile.language && normalizedProfile.topic && normalizedProfile.topic.length >= MIN_TOPIC_LENGTH)

  return {
    message: truncateInline(parsed.message, 500) || (hasRequiredProfile ? '已整理好生成需求。' : '我需要再确认几个细节。'),
    questions,
    ready: Boolean(parsed.ready) && hasRequiredProfile,
    profile: normalizedProfile,
  }
}

function normalizeLevel(level) {
  const value = truncateInline(level, 20)
  return ['入门', '初级', '中级', '高级', '专业'].includes(value) ? value : '初级'
}

function normalizeStudyItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 50).map((item) => ({
    itemId: stringValue(item.itemId ?? item.id).trim(),
    wordId: stringValue(item.wordId).trim(),
    mode: item.mode === 'spelling' ? 'spelling' : 'recognition',
    language: truncateInline(item.language, 40),
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

function generationTimeoutMs(wordCount) {
  if (wordCount <= 100) return DEFAULT_TIMEOUT_MS
  return Math.min(180000, DEFAULT_TIMEOUT_MS + Math.ceil(wordCount / 1000) * 30000)
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
