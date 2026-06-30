import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAiSettings, saveAiSettings } from '../services/api/settingsApi'
import { useAiSettingsStore } from './aiSettings'

vi.mock('../services/api/settingsApi', () => ({
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
      hasApiKey: true,
      apiKeyPreview: 'sk-a****1234',
    })
    vi.mocked(saveAiSettings).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: true,
      hasApiKey: true,
      apiKeyPreview: 'sk-a****1234',
    })
  })

  it('loads settings and keeps the secret out of the editable draft', async () => {
    const store = useAiSettingsStore()

    await store.load()

    expect(store.enabled).toBe(true)
    expect(store.draft.apiKey).toBe('')
    expect(store.statusLabel).toBe('DeepSeek 已启用')
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
    })
  })
})
