import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAiApiKey, fetchAiSettings, saveAiSettings } from '../services/api/settingsApi'
import { useAiSettingsStore } from './aiSettings'

vi.mock('../services/api/settingsApi', () => ({
  clearAiApiKey: vi.fn(),
  fetchAiSettings: vi.fn(),
  saveAiSettings: vi.fn(),
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
  })

  it('loads settings and keeps the secret out of the editable draft', async () => {
    const store = useAiSettingsStore()

    await store.load()

    expect(store.enabled).toBe(true)
    expect(store.draft.apiKey).toBe('')
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
})
