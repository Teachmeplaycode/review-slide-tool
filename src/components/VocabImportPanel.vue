<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Loader2, UploadCloud } from 'lucide-vue-next'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useVocabImportStore } from '../stores/vocabImport'
import { useVocabStore } from '../stores/vocab'

const vocab = useVocabStore()
const importer = useVocabImportStore()
const aiSettings = useAiSettingsStore()

const aiStatus = computed(() => (aiSettings.enabled ? 'DeepSeek 处理' : '本地规则解析'))

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importer.setFile(input.files?.[0] ?? null)
}

async function runImport() {
  const result = await importer.runImport(vocab.selectedBookId)
  if (!result) return

  if (result.targetMode === 'new_book') {
    await vocab.selectBook(result.book.id)
  } else {
    await vocab.refreshSelectedBookData()
  }
}
</script>

<template>
  <section class="import-panel vocab-import-panel">
    <header>
      <div>
        <UploadCloud :size="18" />
        <strong>导入单词库</strong>
      </div>
      <span>{{ aiStatus }}</span>
    </header>

    <div class="import-target-grid">
      <button
        type="button"
        :class="{ active: importer.targetMode === 'new_book' }"
        @click="importer.targetMode = 'new_book'"
      >
        新建词库
      </button>
      <button
        type="button"
        :disabled="!vocab.selectedBookId"
        :class="{ active: importer.targetMode === 'merge_current' }"
        @click="importer.targetMode = 'merge_current'"
      >
        合并当前词库
      </button>
    </div>

    <label v-if="importer.targetMode === 'new_book'" class="import-field">
      <span>词库名称</span>
      <input v-model="importer.bookName" type="text" placeholder="默认使用文件名" />
    </label>

    <label class="file-upload-box">
      <input
        type="file"
        accept=".txt,.md,.markdown,.docx,.doc"
        @change="onFileChange"
      />
      <FileText :size="22" />
      <span>{{ importer.fileName || '选择 txt、markdown、docx 或 doc 文件' }}</span>
    </label>

    <button class="btn-outline" type="button" :disabled="!importer.canImport" @click="runImport">
      <Loader2 v-if="importer.importing" :size="16" class="spin" />
      <UploadCloud v-else :size="16" />
      {{ importer.importing ? '正在导入' : '开始导入' }}
    </button>

    <p v-if="importer.error" class="error-line">{{ importer.error }}</p>

    <div v-if="importer.result" class="import-result">
      <strong>导入完成：{{ importer.result.book.name }}</strong>
      <span>
        {{ importer.result.sourceFile }} · {{ importer.result.provider === 'deepseek' ? 'DeepSeek' : '本地解析' }}
      </span>
      <p>新增 {{ importer.result.importedCount }} 个，跳过重复 {{ importer.result.skippedCount }} 个。</p>
    </div>
  </section>
</template>
