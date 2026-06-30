<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, BookOpen, CheckCircle2, Database, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()

const masteryLabel = computed(() => {
  if (!store.overview || store.overview.totalWords === 0) return '0%'
  return `${Math.round((store.overview.learnedWords / store.overview.totalWords) * 100)}%`
})
</script>

<template>
  <section class="slide surface-cold">
    <div class="slide-inner vocab-library">
      <aside class="vocab-side">
        <span class="section-label">Vocabulary Library</span>
        <TypewriterText as="h1" text="英语基础词库" :active="active" :duration="0.72" />
        <TypewriterText
          as="p"
          text="从本地 SQLite 读取词库，支持新增、编辑、禁用单词，并记录每次训练后的熟练度。"
          :active="active"
          :delay="0.12"
          :duration="0.72"
        />

        <div class="vocab-book-list" data-allow-scroll="true">
          <button
            v-for="book in store.books"
            :key="book.id"
            type="button"
            :class="{ active: book.id === store.selectedBookId }"
            @click="store.selectBook(book.id)"
          >
            <BookOpen :size="18" />
            <span>
              <strong>{{ book.name }}</strong>
              <small>{{ book.description }}</small>
            </span>
          </button>
        </div>

        <dl class="vocab-stats">
          <div>
            <dt>{{ store.overview?.totalWords ?? 0 }}</dt>
            <dd>可学单词</dd>
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

        <button class="btn-dark wide" type="button" :disabled="!store.selectedBookId" @click="store.unlockTo(1)">
          <ArrowRight :size="18" /> 进入学习设置
        </button>
      </aside>

      <div class="vocab-workspace">
        <header class="vocab-toolbar">
          <label class="search-box">
            <Search :size="16" />
            <input
              :value="store.wordQuery"
              type="search"
              placeholder="搜索英文、中文释义或标签"
              @input="store.searchWords(($event.target as HTMLInputElement).value)"
            />
          </label>
          <span>
            <Database :size="16" />
            {{ store.wordTotal }} 个结果
          </span>
        </header>

        <form class="word-form" @submit.prevent="store.saveWordDraft">
          <div class="word-form__head">
            <strong>{{ store.editingWordId ? '编辑单词' : '新增单词' }}</strong>
            <button v-if="store.editingWordId" class="mini-command" type="button" @click="store.resetWordDraft">
              <X :size="14" /> 取消编辑
            </button>
          </div>

          <div class="word-form__grid">
            <input v-model="store.wordDraft.word" required placeholder="英文单词" />
            <input v-model="store.wordDraft.phonetic" placeholder="音标" />
            <input v-model="store.wordDraft.partOfSpeech" placeholder="词性，如 n./v." />
            <input v-model="store.wordDraft.meaningZh" required placeholder="中文释义" />
            <input v-model="store.wordDraft.exampleEn" placeholder="英文例句" />
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
            <Plus :size="16" /> {{ store.editingWordId ? '保存修改' : '添加到词库' }}
          </button>
        </form>

        <p v-if="store.error" class="error-line">{{ store.error }}</p>

        <div class="word-table" data-allow-scroll="true">
          <article v-for="word in store.words" :key="word.id" class="word-row">
            <div class="word-row__main">
              <strong>{{ word.word }}</strong>
              <span>{{ word.phonetic || '暂无音标' }}</span>
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

          <div v-if="!store.words.length" class="empty-state">
            <p>当前没有匹配单词。</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
