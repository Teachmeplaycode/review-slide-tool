import type { AiSettings, AiSettingsDraft, SearchSettings, SearchSettingsDraft } from '../../types'
import { requestJson } from './requestJson'

type SettingsResponse = {
  settings: AiSettings
}

type SearchSettingsResponse = {
  settings: SearchSettings
}

export async function fetchAiSettings(): Promise<AiSettings> {
  const payload = await requestJson<SettingsResponse>('/api/settings/ai')
  return payload.settings
}

export type SaveAiSettingsPayload = Omit<AiSettingsDraft, 'apiKey'> & {
  apiKey?: string
}

export async function saveAiSettings(draft: SaveAiSettingsPayload): Promise<AiSettings> {
  const payload = await requestJson<SettingsResponse>('/api/settings/ai', {
    method: 'PUT',
    body: JSON.stringify(draft),
  })
  return payload.settings
}

export async function clearAiApiKey(): Promise<AiSettings> {
  const payload = await requestJson<SettingsResponse>('/api/settings/ai/key', {
    method: 'DELETE',
  })
  return payload.settings
}

export async function fetchSearchSettings(): Promise<SearchSettings> {
  const payload = await requestJson<SearchSettingsResponse>('/api/settings/search')
  return payload.settings
}

export type SaveSearchSettingsPayload = Omit<SearchSettingsDraft, 'apiKey'> & {
  apiKey?: string
}

export async function saveSearchSettings(draft: SaveSearchSettingsPayload): Promise<SearchSettings> {
  const payload = await requestJson<SearchSettingsResponse>('/api/settings/search', {
    method: 'PUT',
    body: JSON.stringify(draft),
  })
  return payload.settings
}

export async function clearSearchApiKey(): Promise<SearchSettings> {
  const payload = await requestJson<SearchSettingsResponse>('/api/settings/search/key', {
    method: 'DELETE',
  })
  return payload.settings
}
