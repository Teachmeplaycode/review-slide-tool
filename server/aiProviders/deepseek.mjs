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
              truncateText(text, 16000),
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

export function parseDeepSeekWords(content) {
  const raw = String(content ?? '').trim()
  if (!raw) return []

  const jsonText = stripJsonFence(raw)
  let parsed

  try {
    parsed = JSON.parse(jsonText)
  } catch {
    const fallback = extractJsonBlock(jsonText)
    parsed = fallback ? JSON.parse(fallback) : null
  }

  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.words)) return parsed.words
  return []
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

function truncateText(text, limit) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n\n[文本过长，已截断]`
}

function trimSlash(url) {
  return String(url || 'https://api.deepseek.com').replace(/\/+$/, '')
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
