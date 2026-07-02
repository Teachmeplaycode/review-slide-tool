import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAiApiKey,
  clearSearchApiKey,
  fetchAiSettings,
  fetchSearchSettings,
  saveAiSettings,
  saveSearchSettings,
} from '../../src/services/api/settingsApi'
import { useAiSettingsStore } from '../../src/stores/aiSettings'

vi.mock('../../src/services/api/settingsApi', () => ({
  clearAiApiKey: vi.fn(),
  clearSearchApiKey: vi.fn(),
  fetchAiSettings: vi.fn(),
  fetchSearchSettings: vi.fn(),
  saveAiSettings: vi.fn(),
  saveSearchSettings: vi.fn(),
}))

describe('ai settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(fetchAiSettings).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: true,
      reviewEnabled: true,
      hasApiKey: true,
      apiKeyPreview: 'sk-a****1234',
    })
    vi.mocked(saveAiSettings).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: true,
      reviewEnabled: true,
      hasApiKey: true,
      apiKeyPreview: 'sk-a****1234',
    })
    vi.mocked(clearAiApiKey).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: false,
      reviewEnabled: false,
      hasApiKey: false,
      apiKeyPreview: '',
    })
    vi.mocked(fetchSearchSettings).mockResolvedValue({
      provider: 'tavily',
      baseUrl: 'https://api.tavily.com',
      enabled: true,
      hasApiKey: true,
      apiKeyPreview: 'tvly****1234',
    })
    vi.mocked(saveSearchSettings).mockResolvedValue({
      provider: 'tavily',
      baseUrl: 'https://api.tavily.com',
      enabled: true,
      hasApiKey: true,
      apiKeyPreview: 'tvly****1234',
    })
    vi.mocked(clearSearchApiKey).mockResolvedValue({
      provider: 'tavily',
      baseUrl: 'https://api.tavily.com',
      enabled: false,
      hasApiKey: false,
      apiKeyPreview: '',
    })
  })

  it('loads settings and keeps the secret out of the editable drafts', async () => {
    const store = useAiSettingsStore()

    await store.load()

    expect(store.enabled).toBe(true)
    expect(store.searchEnabled).toBe(true)
    expect(store.draft.apiKey).toBe('')
    expect(store.searchDraft.apiKey).toBe('')
    expect(store.statusLabel).toBe('导入和解析均已启用')
  })

  it('does not send an empty apiKey when saving an existing key', async () => {
    const store = useAiSettingsStore()
    await store.load()

    store.draft.model = 'deepseek-chat'
    await store.save()

    expect(saveAiSettings).toHaveBeenCalledWith({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: true,
      reviewEnabled: true,
    })
  })

  it('clears the saved API key and disables AI features', async () => {
    const store = useAiSettingsStore()
    await store.load()

    await store.clearKey()

    expect(clearAiApiKey).toHaveBeenCalled()
    expect(store.settings?.hasApiKey).toBe(false)
    expect(store.draft.enabled).toBe(false)
    expect(store.draft.reviewEnabled).toBe(false)
  })

  it('saves and clears Tavily search settings separately', async () => {
    const store = useAiSettingsStore()
    await store.load()

    store.searchDraft.enabled = true
    await store.saveSearch()

    expect(saveSearchSettings).toHaveBeenCalledWith({
      baseUrl: 'https://api.tavily.com',
      enabled: true,
    })

    await store.clearSearchKey()

    expect(clearSearchApiKey).toHaveBeenCalled()
    expect(store.searchSettings?.hasApiKey).toBe(false)
    expect(store.searchDraft.enabled).toBe(false)
  })
})
