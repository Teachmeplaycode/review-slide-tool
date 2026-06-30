import type { AiSettings, AiSettingsDraft } from '../../types'
import { requestJson } from './requestJson'

type SettingsResponse = {
  settings: AiSettings
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
