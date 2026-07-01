<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next'
import AiSettingsPanel from './AiSettingsPanel.vue'
import AiVocabGeneratorPanel from './AiVocabGeneratorPanel.vue'
import VocabImportPanel from './VocabImportPanel.vue'
import { useVocabStore } from '../stores/vocab'

const emit = defineEmits<{
  close: []
}>()

type SettingsPanel = 'words' | 'library' | 'generate' | 'import' | 'api'

const store = useVocabStore()
const activePanel = ref<SettingsPanel>(store.selectedBookId ? 'words' : 'library')

const masteryLabel = computed(() => {
  if (!store.overview || store.overview.totalWords === 0) return '0%'
  return `${Math.round((store.overview.learnedWords / store.overview.totalWords) * 100)}%`
})

const panelOptions: { value: SettingsPanel; label: string }[] = [
  { value: 'words', label: '词条' },
  { value: 'library', label: '编辑词库' },
  { value: 'generate', label: 'AI 生成' },
  { value: 'import', label: '导入' },
  { value: 'api', label: 'API' },
]

function languageLabel(language: string) {
  return language === 'en' ? '英语' : language
}

function onSettingsContentScroll(event: Event) {
  if (activePanel.value !== 'words' || !store.hasMoreWords || store.loadingMoreWords) return

  const container = event.currentTarget as HTMLElement
  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
  if (distanceToBottom <= 220) {
    void store.loadMoreWords()
  }
}

function selectBook(bookId: string) {
  void store.selectBook(bookId)
  activePanel.value = 'words'
}

async function confirmDeleteSelectedBook() {
  const name = store.selectedBook?.name ?? '当前词库'
  if (!window.confirm(`确定删除“${name}”？词库内词条、进度和训练记录会一起删除。`)) return
  await store.deleteSelectedBook()
  activePanel.value = store.selectedBookId ? 'words' : 'library'
}
</script>

<template>
  <main class="settings-page surface-cold">
    <div class="settings-page__inner">
      <header class="settings-page__header">
        <button class="mini-command" type="button" @click="emit('close')">
          <ArrowLeft :size="15" /> 返回首页
        </button>
        <div>
          <span class="section-label">Settings</span>
          <h1>设置</h1>
        </div>
      </header>

      <div class="settings-page__layout">
        <aside class="settings-page__side" data-allow-scroll="true">
          <section class="settings-block">
            <header>
              <BookOpen :size="18" />
              <strong>词库</strong>
            </header>
            <div v-if="store.books.length" class="settings-book-list" data-allow-scroll="true">
              <button
                v-for="book in store.books"
                :key="book.id"
                type="button"
                :class="{ active: book.id === store.selectedBookId }"
                @click="selectBook(book.id)"
              >
                <strong>{{ book.name }}</strong>
                <span>{{ languageLabel(book.language) }} · {{ book.wordCount }} 词</span>
              </button>
            </div>
            <p v-else>还没有词库，请到导入页上传文件。</p>
          </section>

          <dl class="vocab-stats">
            <div>
              <dt>{{ store.overview?.totalWords ?? 0 }}</dt>
              <dd>可学词条</dd>
            </div>
            <div>
              <dt>{{ store.overview?.reviewWords ?? 0 }}</dt>
              <dd>错词复习</dd>
            </div>
            <div>
              <dt>{{ masteryLabel }}</dt>
              <dd>已学习</dd>
            </div>
          </dl>

          <div class="settings-page__tabs">
            <button
              v-for="option in panelOptions"
              :key="option.value"
              type="button"
              :disabled="option.value === 'words' && !store.selectedBookId"
              :class="{ active: activePanel === option.value }"
              @click="activePanel = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </aside>

        <section class="settings-page__content" data-allow-scroll="true" @scroll.passive="onSettingsContentScroll">
          <div v-if="activePanel === 'words'" class="settings-panel word-home-panel">
            <header class="vocab-toolbar">
              <label class="search-box">
                <Search :size="16" />
                <input
                  :value="store.wordQuery"
                  :disabled="!store.selectedBookId"
                  type="search"
                  placeholder="搜索目标词、中文释义或标签"
                  @input="store.searchWords(($event.target as HTMLInputElement).value)"
                />
              </label>
              <span>
                <Database :size="16" />
                {{ store.wordDisplayLabel }}
              </span>
              <button
                class="mini-command"
                type="button"
                :disabled="!store.selectedBookId || store.generatingPhonetics"
                @click="store.generateMissingPhonetics()"
              >
                <Loader2 v-if="store.generatingPhonetics" :size="14" class="spin" />
                <Sparkles v-else :size="14" />
                {{ store.generatingPhonetics ? '生成中' : '生成缺失读音' }}
              </button>
            </header>

            <form v-if="store.selectedBookId" class="word-form word-form--compact" @submit.prevent="store.saveWordDraft">
              <div class="word-form__head">
                <strong>{{ store.editingWordId ? '编辑词条' : '新增词条' }}</strong>
                <button v-if="store.editingWordId" class="mini-command" type="button" @click="store.resetWordDraft">
                  <X :size="14" /> 取消编辑
                </button>
              </div>

              <div class="word-form__grid">
                <input v-model="store.wordDraft.word" required :placeholder="store.targetTermLabel" />
                <input v-model="store.wordDraft.phonetic" placeholder="读音 / 音标" />
                <input v-model="store.wordDraft.partOfSpeech" placeholder="词性，如 n./v." />
                <input v-model="store.wordDraft.meaningZh" required placeholder="中文释义" />
                <input v-model="store.wordDraft.exampleEn" placeholder="目标语例句" />
                <input v-model="store.wordDraft.exampleZh" placeholder="中文例句" />
                <input v-model="store.wordDraft.tags" placeholder="标签，如 basic,study" />
                <select v-model.number="store.wordDraft.difficulty">
                  <option :value="1">难度 1</option>
                  <option :value="2">难度 2</option>
                  <option :value="3">难度 3</option>
                  <option :value="4">难度 4</option>
                  <option :value="5">难度 5</option>
                </select>
              </div>

              <button
                class="btn-dark"
                type="submit"
                :disabled="store.savingWord || !store.wordDraft.word.trim() || !store.wordDraft.meaningZh.trim()"
              >
                <Plus :size="16" /> {{ store.editingWordId ? '保存修改' : '添加到学习库' }}
              </button>
            </form>

            <div class="workspace-messages">
              <p v-if="store.error" class="error-line">{{ store.error }}</p>
              <p v-if="store.phoneticStatus" class="status-line">{{ store.phoneticStatus }}</p>
            </div>

            <div v-if="store.selectedBookId" class="word-table" data-allow-scroll="true">
              <article v-for="word in store.words" :key="word.id" class="word-row">
                <div class="word-row__main">
                  <strong>{{ word.word }}</strong>
                  <span>{{ word.phonetic || '暂无读音' }}</span>
                  <small>{{ word.partOfSpeech }} {{ word.meaningZh }}</small>
                </div>
                <div class="word-row__meta">
                  <span>
                    <CheckCircle2 :size="14" />
                    熟练度 {{ word.progress.mastery }}/5
                  </span>
                  <span>难度 {{ word.difficulty }}</span>
                </div>
                <div class="word-row__actions">
                  <button class="icon-command" type="button" title="编辑" @click="store.editWord(word)">
                    <Pencil :size="15" />
                  </button>
                  <button class="icon-command danger" type="button" title="禁用" @click="store.removeWord(word.id)">
                    <Trash2 :size="15" />
                  </button>
                </div>
              </article>
              <div v-if="!store.words.length" class="empty-state word-empty-state">
                <p>当前没有匹配词条。</p>
              </div>
              <footer v-else class="word-list-footer">
                <span>{{ store.wordDisplayLabel }}</span>
                <span class="word-list-footer__status">
                  {{ store.loadingMoreWords ? '正在加载更多' : store.hasMoreWords ? '滚到底部自动加载' : '已全部显示' }}
                </span>
              </footer>
            </div>
          </div>

          <div v-else-if="activePanel === 'library'" class="settings-panel manage-home-panel">
            <form v-if="store.selectedBook" class="book-manage" @submit.prevent="store.saveBookDraft">
              <header>
                <strong>当前词库</strong>
                <button class="mini-command" type="button" @click="store.resetBookDraft">
                  <RotateCcw :size="14" /> 重置
                </button>
              </header>
              <label>
                <span>词库名称</span>
                <input v-model="store.bookDraft.name" type="text" required />
              </label>
              <label>
                <span>词库描述</span>
                <textarea v-model="store.bookDraft.description" rows="3" placeholder="用于说明来源、范围或学习目标" />
              </label>
              <label>
                <span>目标语言</span>
                <input v-model="store.bookDraft.language" type="text" required placeholder="例如：英语、日语、法语" />
              </label>
              <div class="book-manage__actions">
                <button class="mini-command" type="submit" :disabled="store.savingBook || !store.bookDraft.name.trim()">
                  <Save :size="14" /> 保存
                </button>
                <button
                  class="mini-command"
                  type="button"
                  :disabled="store.exportingBook"
                  @click="store.exportSelectedBook"
                >
                  <Download :size="14" /> {{ store.exportingBook ? '导出中' : '导出词库' }}
                </button>
                <button
                  class="mini-command danger"
                  type="button"
                  :disabled="store.deletingBook"
                  @click="confirmDeleteSelectedBook"
                >
                  <Trash2 :size="14" /> 删除词库
                </button>
              </div>
            </form>

            <div v-else class="empty-state library-empty-state">
              <strong>还没有词库</strong>
              <p>切换到“导入”上传文件，导入后可在这里编辑名称、描述并导出处理后的词库。</p>
              <button class="mini-command" type="button" @click="activePanel = 'import'">去导入</button>
            </div>
          </div>

          <div v-else-if="activePanel === 'generate'" class="settings-panel settings-panel--narrow">
            <AiVocabGeneratorPanel />
          </div>

          <div v-else-if="activePanel === 'import'" class="settings-panel settings-panel--narrow">
            <VocabImportPanel />
          </div>

          <div v-else class="settings-panel settings-panel--narrow">
            <AiSettingsPanel />
          </div>

          <div v-if="!store.selectedBookId && activePanel === 'words'" class="empty-state library-empty-state">
            <strong>还没有词库</strong>
            <p>切换到“导入”上传文件。</p>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
