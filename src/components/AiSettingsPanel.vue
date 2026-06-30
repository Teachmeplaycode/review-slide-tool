<script setup lang="ts">
import { onMounted } from 'vue'
import { KeyRound, Save, ServerCog } from 'lucide-vue-next'
import { useAiSettingsStore } from '../stores/aiSettings'

const settings = useAiSettingsStore()

onMounted(() => {
  void settings.load()
})
</script>

<template>
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

      <p v-if="settings.error" class="error-line">{{ settings.error }}</p>

      <button class="btn-outline" type="submit" :disabled="settings.saving">
        <Save :size="16" /> 保存 API 设置
      </button>
    </form>

    <p class="setup-hint">
      <KeyRound :size="14" />
      Key 会保存到本地 SQLite；导入时由后端读取，不会返回完整 Key 给前端。
    </p>
  </section>
</template>
