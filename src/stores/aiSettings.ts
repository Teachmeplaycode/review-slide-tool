import { defineStore } from 'pinia'
import type { AiSettings, AiSettingsDraft, SearchSettings, SearchSettingsDraft } from '../types'
import {
  clearAiApiKey,
  clearSearchApiKey,
  fetchAiSettings,
  fetchSearchSettings,
  saveAiSettings,
  saveSearchSettings,
} from '../services/api/settingsApi'

type AiSettingsState = {
  settings: AiSettings | null
  searchSettings: SearchSettings | null
  draft: AiSettingsDraft
  searchDraft: SearchSettingsDraft
  loading: boolean
  saving: boolean
  savingSearch: boolean
  error: string
  searchError: string
}

export const defaultAiSettingsDraft = (): AiSettingsDraft => ({
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  enabled: false,
  reviewEnabled: false,
})

export const defaultSearchSettingsDraft = (): SearchSettingsDraft => ({
  apiKey: '',
  baseUrl: 'https://api.tavily.com',
  enabled: false,
})

export const useAiSettingsStore = defineStore('aiSettings', {
  state: (): AiSettingsState => ({
    settings: null,
    searchSettings: null,
    draft: defaultAiSettingsDraft(),
    searchDraft: defaultSearchSettingsDraft(),
    loading: false,
    saving: false,
    savingSearch: false,
    error: '',
    searchError: '',
  }),

  getters: {
    enabled(state): boolean {
      return Boolean(state.settings?.enabled)
    },
    reviewEnabled(state): boolean {
      return Boolean(state.settings?.reviewEnabled)
    },
    searchEnabled(state): boolean {
      return Boolean(state.searchSettings?.enabled)
    },
    statusLabel(state): string {
      if (!state.settings?.hasApiKey) return '未配置，导入时使用本地解析'
      if (state.settings.enabled && state.settings.reviewEnabled) return '导入和解析均已启用'
      if (state.settings.enabled) return 'DeepSeek 导入已启用'
      if (state.settings.reviewEnabled) return 'AI 批改解析已启用'
      return '已保存 Key，当前未启用'
    },
    searchStatusLabel(state): string {
      if (!state.searchSettings?.hasApiKey) return '未配置 Tavily Key'
      if (state.searchSettings.enabled) return '实时检索已启用'
      return '已保存 Key，检索未启用'
    },
  },

  actions: {
    async load() {
      this.loading = true
      this.error = ''
      this.searchError = ''

      try {
        const [aiSettings, searchSettings] = await Promise.all([
          fetchAiSettings(),
          fetchSearchSettings(),
        ])
        this.settings = aiSettings
        this.searchSettings = searchSettings
        this.resetDraft()
        this.resetSearchDraft()
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
        reviewEnabled: this.settings?.reviewEnabled ?? false,
      }
    },

    resetSearchDraft() {
      this.searchDraft = {
        apiKey: '',
        baseUrl: this.searchSettings?.baseUrl ?? 'https://api.tavily.com',
        enabled: this.searchSettings?.enabled ?? false,
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
          reviewEnabled: this.draft.reviewEnabled,
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

    async saveSearch() {
      this.savingSearch = true
      this.searchError = ''

      try {
        const payload = {
          baseUrl: this.searchDraft.baseUrl,
          enabled: this.searchDraft.enabled,
          ...(this.searchDraft.apiKey.trim() ? { apiKey: this.searchDraft.apiKey.trim() } : {}),
        }
        this.searchSettings = await saveSearchSettings(payload)
        this.resetSearchDraft()
      } catch (error) {
        this.searchError = errorMessage(error)
      } finally {
        this.savingSearch = false
      }
    },

    async clearKey() {
      this.saving = true
      this.error = ''

      try {
        this.settings = await clearAiApiKey()
        this.resetDraft()
      } catch (error) {
        this.error = errorMessage(error)
      } finally {
        this.saving = false
      }
    },

    async clearSearchKey() {
      this.savingSearch = true
      this.searchError = ''

      try {
        this.searchSettings = await clearSearchApiKey()
        this.resetSearchDraft()
      } catch (error) {
        this.searchError = errorMessage(error)
      } finally {
        this.savingSearch = false
      }
    },
  },
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存 API 设置失败'
}
