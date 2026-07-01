const DEFAULT_TIMEOUT_MS = 20000

export async function searchVocabularyContextWithTavily({
  profile = {},
  conversation = [],
  settings,
  fetchImpl = fetch,
  maxResults = 5,
}) {
  if (!settings?.apiKey) {
    throw createHttpError(400, 'Tavily API Key 未配置')
  }

  const query = buildQuery(profile, conversation)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetchImpl(`${trimSlash(settings.baseUrl)}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topic: 'general',
        search_depth: 'basic',
        include_answer: 'basic',
        include_raw_content: false,
        max_results: clampNumber(maxResults, 3, 5),
      }),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw createHttpError(response.status, payload?.error || payload?.message || 'Tavily 检索失败')
    }

    const sources = (Array.isArray(payload?.results) ? payload.results : [])
      .map((item) => ({
        title: cleanText(item.title, 120) || cleanText(item.url, 120),
        url: cleanText(item.url, 400),
        content: cleanText(item.content ?? item.snippet, 500),
        publishedDate: cleanText(item.published_date ?? item.publishedDate, 40),
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
      }))
      .filter((item) => item.title && item.url && item.content)
      .slice(0, clampNumber(maxResults, 3, 5))

    return {
      query: cleanText(payload?.query, 240) || query,
      answer: cleanText(payload?.answer, 900),
      sources,
      provider: 'tavily',
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError(504, 'Tavily 检索超时')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function buildQuery(profile, conversation) {
  const pieces = [
    cleanText(profile.language, 40),
    cleanText(profile.topic ?? profile.idea, 240),
    cleanText(profile.scenario, 80),
    latestUserMessage(conversation),
    '学习词汇 常用表达 最新语境',
  ].filter(Boolean)
  return cleanText(pieces.join(' '), 320)
}

function latestUserMessage(conversation) {
  const message = [...(Array.isArray(conversation) ? conversation : [])]
    .reverse()
    .find((item) => item?.role === 'user')
  return cleanText(message?.content, 180)
}

function cleanText(value, limit) {
  const text = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
  return text.length > limit ? text.slice(0, limit) : text
}

function trimSlash(url) {
  return String(url || 'https://api.tavily.com').replace(/\/+$/, '')
}

function clampNumber(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.round(number)))
}

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
