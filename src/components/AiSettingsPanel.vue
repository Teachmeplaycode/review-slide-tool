<script setup lang="ts">
import { onMounted } from 'vue'
import { KeyRound, Save, Search, ServerCog, Sparkles, Trash2 } from 'lucide-vue-next'
import { useAiSettingsStore } from '../stores/aiSettings'

const settings = useAiSettingsStore()

onMounted(() => {
  void settings.load()
})
</script>

<template>
  <div class="ai-settings-stack">
    <section class="import-panel ai-settings-panel">
      <header>
        <div>
          <ServerCog :size="18" />
          <strong>DeepSeek API 设置</strong>
        </div>
        <span :class="{ active: settings.enabled }">{{ settings.statusLabel }}</span>
      </header>

      <form class="settings-form" @submit.prevent="settings.save">
        <label>
          <span>API Key</span>
          <input
            v-model="settings.draft.apiKey"
            type="password"
            autocomplete="off"
            :placeholder="settings.settings?.apiKeyPreview || 'sk-...'"
          />
        </label>

        <label>
          <span>Base URL</span>
          <input v-model="settings.draft.baseUrl" type="url" placeholder="https://api.deepseek.com" />
        </label>

        <label>
          <span>Model</span>
          <input v-model="settings.draft.model" type="text" placeholder="deepseek-chat" />
        </label>

        <label class="toggle-row compact-toggle">
          <input v-model="settings.draft.enabled" type="checkbox" />
          <span>启用 DeepSeek 导入处理</span>
        </label>

        <label class="toggle-row compact-toggle">
          <input v-model="settings.draft.reviewEnabled" type="checkbox" />
          <span><Sparkles :size="14" /> 启用 AI 批改与简短解析</span>
        </label>

        <p v-if="settings.error" class="error-line">{{ settings.error }}</p>

        <div class="settings-actions">
          <button class="btn-outline" type="submit" :disabled="settings.saving">
            <Save :size="16" /> 保存 DeepSeek 设置
          </button>
          <button
            v-if="settings.settings?.hasApiKey"
            class="mini-command danger"
            type="button"
            :disabled="settings.saving"
            @click="settings.clearKey"
          >
            <Trash2 :size="14" /> 清除 Key
          </button>
        </div>
      </form>

      <p class="setup-hint">
        <KeyRound :size="14" />
        Key 会保存到本地 SQLite；生成、导入和解析时由后端读取，不会返回完整 Key 给前端。
      </p>
    </section>

    <section class="import-panel ai-settings-panel">
      <header>
        <div>
          <Search :size="18" />
          <strong>检索 API 设置</strong>
        </div>
        <span :class="{ active: settings.searchEnabled }">{{ settings.searchStatusLabel }}</span>
      </header>

      <form class="settings-form" @submit.prevent="settings.saveSearch">
        <label>
          <span>Tavily API Key</span>
          <input
            v-model="settings.searchDraft.apiKey"
            type="password"
            autocomplete="off"
            :placeholder="settings.searchSettings?.apiKeyPreview || 'tvly-...'"
          />
        </label>

        <label>
          <span>Base URL</span>
          <input v-model="settings.searchDraft.baseUrl" type="url" placeholder="https://api.tavily.com" />
        </label>

        <label class="toggle-row compact-toggle">
          <input v-model="settings.searchDraft.enabled" type="checkbox" />
          <span><Search :size="14" /> 启用高级对话的实时检索</span>
        </label>

        <p v-if="settings.searchError" class="error-line">{{ settings.searchError }}</p>

        <div class="settings-actions">
          <button class="btn-outline" type="submit" :disabled="settings.savingSearch">
            <Save :size="16" /> 保存 Tavily 设置
          </button>
          <button
            v-if="settings.searchSettings?.hasApiKey"
            class="mini-command danger"
            type="button"
            :disabled="settings.savingSearch"
            @click="settings.clearSearchKey"
          >
            <Trash2 :size="14" /> 清除 Key
          </button>
        </div>
      </form>

      <p class="setup-hint">
        <KeyRound :size="14" />
        检索默认关闭；只有高级对话里手动开启时，才会请求 Tavily 并把 3-5 条来源摘要加入生成上下文。
      </p>
    </section>
  </div>
</template>
