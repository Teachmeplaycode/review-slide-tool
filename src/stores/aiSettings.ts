import { defineStore } from 'pinia'
import type { AiSettings, AiSettingsDraft } from '../types'
import { fetchAiSettings, saveAiSettings } from '../services/api/settingsApi'

type AiSettingsState = {
  settings: AiSettings | null
  draft: AiSettingsDraft
  loading: boolean
  saving: boolean
  error: string
}

export const defaultAiSettingsDraft = (): AiSettingsDraft => ({
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  enabled: false,
})

export const useAiSettingsStore = defineStore('aiSettings', {
  state: (): AiSettingsState => ({
    settings: null,
    draft: defaultAiSettingsDraft(),
    loading: false,
    saving: false,
    error: '',
  }),

  getters: {
    enabled(state): boolean {
      return Boolean(state.settings?.enabled)
    },
    statusLabel(state): string {
      if (!state.settings?.hasApiKey) return '未配置，导入时使用本地解析'
      return state.settings.enabled ? 'DeepSeek 已启用' : '已保存 Key，当前未启用'
    },
  },

  actions: {
    async load() {
      this.loading = true
      this.error = ''

      try {
        this.settings = await fetchAiSettings()
        this.resetDraft()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.loading = false
      }
    },

    resetDraft() {
      this.draft = {
        apiKey: '',
        baseUrl: this.settings?.baseUrl ?? 'https://api.deepseek.com',
        model: this.settings?.model ?? 'deepseek-chat',
        enabled: this.settings?.enabled ?? false,
      }
    },

    async save() {
      this.saving = true
      this.error = ''

      try {
        const payload = {
          baseUrl: this.draft.baseUrl,
          model: this.draft.model,
          enabled: this.draft.enabled,
          ...(this.draft.apiKey.trim() ? { apiKey: this.draft.apiKey.trim() } : {}),
        }
        this.settings = await saveAiSettings(payload)
        this.resetDraft()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.saving = false
      }
    },
  },
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存 API 设置失败'
}
