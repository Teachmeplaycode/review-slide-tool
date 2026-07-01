<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { FileText, Loader2, UploadCloud } from 'lucide-vue-next'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useVocabImportStore } from '../stores/vocabImport'
import { useVocabStore } from '../stores/vocab'

const vocab = useVocabStore()
const importer = useVocabImportStore()
const aiSettings = useAiSettingsStore()

const aiStatus = computed(() => (aiSettings.enabled ? 'DeepSeek 处理' : '本地规则解析'))
const importBusy = computed(() => importer.importing || vocab.generatingPhonetics)
const importButtonLabel = computed(() => {
  if (importer.importing) return aiSettings.enabled ? 'DeepSeek 正在整理' : '正在导入'
  if (vocab.generatingPhonetics) return '正在补全读音'
  return '开始导入'
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importer.setFile(input.files?.[0] ?? null)
}

onMounted(() => {
  void aiSettings.load()
})

async function runImport() {
  const result = await importer.runImport(vocab.selectedBookId, vocab.selectedLanguageLabel)
  if (!result) return

  if (result.targetMode === 'new_book') {
    await vocab.selectBook(result.book.id)
  } else {
    await vocab.refreshSelectedBookData()
  }

  if (result.usedAi) {
    await vocab.generateMissingPhonetics({ bookId: result.book.id, auto: true })
  }
}
</script>

<template>
  <section class="import-panel vocab-import-panel">
    <header>
      <div>
        <UploadCloud :size="18" />
        <strong>导入学习库</strong>
      </div>
      <span>{{ aiStatus }}</span>
    </header>

    <div class="import-target-grid">
      <button
        type="button"
        :class="{ active: importer.targetMode === 'new_book' }"
        @click="importer.targetMode = 'new_book'"
      >
        导入为独立词库
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

    <label v-if="importer.targetMode === 'new_book'" class="import-field">
      <span>目标语言</span>
      <input v-model="importer.language" type="text" placeholder="例如：英语、日语、法语" />
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

    <button class="btn-outline" type="button" :disabled="!importer.canImport || vocab.generatingPhonetics" @click="runImport">
      <Loader2 v-if="importBusy" :size="16" class="spin" />
      <UploadCloud v-else :size="16" />
      {{ importButtonLabel }}
    </button>

    <p v-if="importer.error" class="error-line">{{ importer.error }}</p>
    <p v-if="vocab.generatingPhonetics || vocab.phoneticStatus" class="status-line">{{ vocab.phoneticStatus }}</p>

    <div v-if="importer.result" class="import-result">
      <strong>导入完成：{{ importer.result.book.name }}</strong>
      <span>
        {{ importer.result.sourceFile }} · {{ importer.result.provider === 'deepseek' ? 'DeepSeek' : '本地解析' }}
      </span>
      <p>{{ importer.result.book.language }} · 新增 {{ importer.result.importedCount }} 个，跳过重复 {{ importer.result.skippedCount }} 个。</p>
    </div>
  </section>
</template>
