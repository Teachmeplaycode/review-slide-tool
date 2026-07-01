export const DEFAULT_AI_SETTINGS = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  enabled: false,
  reviewEnabled: false,
}

export const DEFAULT_SEARCH_SETTINGS = {
  provider: 'tavily',
  baseUrl: 'https://api.tavily.com',
  enabled: false,
}

const SETTINGS_ID = 'ai_deepseek'
const SEARCH_SETTINGS_ID = 'search_tavily'

export function getAiSettings(db, { includeSecret = false } = {}) {
  const row = db.prepare('SELECT * FROM api_settings WHERE provider = ?').get(DEFAULT_AI_SETTINGS.provider)

  if (!row) {
    return {
      ...DEFAULT_AI_SETTINGS,
      hasApiKey: false,
      apiKeyPreview: '',
      apiKey: includeSecret ? '' : undefined,
    }
  }

  const apiKey = row.api_key ?? ''

  return {
    provider: row.provider,
    baseUrl: row.base_url || DEFAULT_AI_SETTINGS.baseUrl,
    model: row.model || DEFAULT_AI_SETTINGS.model,
    enabled: Boolean(row.enabled) && Boolean(apiKey),
    reviewEnabled: Boolean(row.review_enabled) && Boolean(apiKey),
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
    apiKey: includeSecret ? apiKey : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getActiveAiSettings(db) {
  const settings = getAiSettings(db, { includeSecret: true })
  if (settings.provider !== DEFAULT_AI_SETTINGS.provider) return null
  if (!settings.enabled || !settings.apiKey) return null
  return settings
}

export function getStudyAiSettings(db) {
  const settings = getAiSettings(db, { includeSecret: true })
  if (settings.provider !== DEFAULT_AI_SETTINGS.provider) return null
  if (!settings.reviewEnabled || !settings.apiKey) return null
  return settings
}

export function getAiSettingsWithKey(db) {
  const settings = getAiSettings(db, { includeSecret: true })
  if (settings.provider !== DEFAULT_AI_SETTINGS.provider) return null
  if (!settings.apiKey) return null
  return settings
}

export function getSearchSettings(db, { includeSecret = false } = {}) {
  const row = db.prepare('SELECT * FROM api_settings WHERE provider = ?').get(DEFAULT_SEARCH_SETTINGS.provider)

  if (!row) {
    return {
      ...DEFAULT_SEARCH_SETTINGS,
      hasApiKey: false,
      apiKeyPreview: '',
      apiKey: includeSecret ? '' : undefined,
    }
  }

  const apiKey = row.api_key ?? ''

  return {
    provider: row.provider,
    baseUrl: row.base_url || DEFAULT_SEARCH_SETTINGS.baseUrl,
    enabled: Boolean(row.enabled) && Boolean(apiKey),
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
    apiKey: includeSecret ? apiKey : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSearchSettingsWithKey(db) {
  const settings = getSearchSettings(db, { includeSecret: true })
  if (settings.provider !== DEFAULT_SEARCH_SETTINGS.provider) return null
  if (!settings.enabled || !settings.apiKey) return null
  return settings
}

export function saveAiSettings(db, input = {}) {
  const current = getAiSettings(db, { includeSecret: true })
  const provider = DEFAULT_AI_SETTINGS.provider
  const baseUrl = stringValue(input.baseUrl, current.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).trim()
  const model = stringValue(input.model, current.model || DEFAULT_AI_SETTINGS.model).trim()
  const nextKey = Object.prototype.hasOwnProperty.call(input, 'apiKey')
    ? stringValue(input.apiKey).trim()
    : current.apiKey
  const enabled = Boolean(input.enabled)
  const reviewEnabled = Boolean(input.reviewEnabled)

  if ((enabled || reviewEnabled) && !nextKey) {
    throw createHttpError(400, '启用 DeepSeek 前需要填写 API Key')
  }

  const now = Date.now()

  db.prepare(`
    INSERT INTO api_settings (id, provider, api_key, base_url, model, enabled, review_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      model = excluded.model,
      enabled = excluded.enabled,
      review_enabled = excluded.review_enabled,
      updated_at = excluded.updated_at
  `).run(
    SETTINGS_ID,
    provider,
    nextKey,
    baseUrl || DEFAULT_AI_SETTINGS.baseUrl,
    model || DEFAULT_AI_SETTINGS.model,
    enabled ? 1 : 0,
    reviewEnabled ? 1 : 0,
    now,
    now,
  )

  return getAiSettings(db)
}

export function clearAiApiKey(db) {
  const current = getAiSettings(db, { includeSecret: true })
  return saveAiSettings(db, {
    baseUrl: current.baseUrl || DEFAULT_AI_SETTINGS.baseUrl,
    model: current.model || DEFAULT_AI_SETTINGS.model,
    apiKey: '',
    enabled: false,
    reviewEnabled: false,
  })
}

export function saveSearchSettings(db, input = {}) {
  const current = getSearchSettings(db, { includeSecret: true })
  const provider = DEFAULT_SEARCH_SETTINGS.provider
  const baseUrl = stringValue(input.baseUrl, current.baseUrl || DEFAULT_SEARCH_SETTINGS.baseUrl).trim()
  const nextKey = Object.prototype.hasOwnProperty.call(input, 'apiKey')
    ? stringValue(input.apiKey).trim()
    : current.apiKey
  const enabled = Boolean(input.enabled)

  if (enabled && !nextKey) {
    throw createHttpError(400, '启用 Tavily 检索前需要填写 API Key')
  }

  const now = Date.now()

  db.prepare(`
    INSERT INTO api_settings (id, provider, api_key, base_url, model, enabled, review_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      model = excluded.model,
      enabled = excluded.enabled,
      review_enabled = excluded.review_enabled,
      updated_at = excluded.updated_at
  `).run(
    SEARCH_SETTINGS_ID,
    provider,
    nextKey,
    baseUrl || DEFAULT_SEARCH_SETTINGS.baseUrl,
    '',
    enabled ? 1 : 0,
    0,
    now,
    now,
  )

  return getSearchSettings(db)
}

export function clearSearchApiKey(db) {
  const current = getSearchSettings(db, { includeSecret: true })
  return saveSearchSettings(db, {
    baseUrl: current.baseUrl || DEFAULT_SEARCH_SETTINGS.baseUrl,
    apiKey: '',
    enabled: false,
  })
}

function maskApiKey(apiKey) {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return '********'
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
