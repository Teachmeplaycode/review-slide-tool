<script setup lang="ts">
import { computed } from 'vue'
import { BookMarked, ListChecks, Play, Shuffle, SpellCheck, Target } from 'lucide-vue-next'
import AiSettingsPanel from '../components/AiSettingsPanel.vue'
import VocabImportPanel from '../components/VocabImportPanel.vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'
import type { StudyMode } from '../types'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()

const modeOptions: { value: StudyMode; label: string; description: string }[] = [
  { value: 'mixed', label: '混合训练', description: '认词和拼写穿插出现，适合日常学习。' },
  { value: 'recognition', label: '认词选择', description: '看英文选中文释义，先建立熟悉度。' },
  { value: 'spelling', label: '拼写练习', description: '看中文写英文，检查真实掌握情况。' },
]

const maxCount = computed(() => Math.max(1, store.overview?.totalWords ?? 1))
const countLabel = computed(() => `${Math.min(store.config.count, maxCount.value)} / ${maxCount.value}`)

function updateCount(event: Event) {
  store.config.count = Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="slide surface-warm">
    <div class="slide-inner setup-grid">
      <aside class="side-copy">
        <span class="section-label">Study Setup</span>
        <TypewriterText as="h2" text="选择这轮背词方式" :active="active" :duration="1.1" />
        <TypewriterText
          as="p"
          text="第一版聚焦英语基础词库，使用本地 SQLite 记录正确率、错词和熟练度。"
          :active="active"
          :delay="0.38"
          :duration="1.1"
        />
        <dl class="stats">
          <div>
            <dt>{{ store.selectedBook?.wordCount ?? 0 }}</dt>
            <dd>词库总量</dd>
          </div>
          <div>
            <dt>{{ store.selectedBook?.reviewCount ?? 0 }}</dt>
            <dd>可复习错词</dd>
          </div>
        </dl>
      </aside>

      <div class="setup-panel vocab-setup-panel">
        <section>
          <header>
            <Shuffle :size="18" />
            <strong>学习数量</strong>
          </header>
          <input
            type="range"
            min="1"
            :max="maxCount"
            :value="Math.min(store.config.count, maxCount)"
            @input="updateCount"
          />
          <div class="range-row">
            <span>1</span>
            <strong>{{ countLabel }}</strong>
            <span>{{ maxCount }}</span>
          </div>
        </section>

        <section>
          <header>
            <Target :size="18" />
            <strong>训练模式</strong>
          </header>
          <div class="mode-grid">
            <button
              v-for="mode in modeOptions"
              :key="mode.value"
              type="button"
              :class="{ active: store.config.mode === mode.value }"
              @click="store.setMode(mode.value)"
            >
              <strong>{{ mode.label }}</strong>
              <span>{{ mode.description }}</span>
            </button>
          </div>
        </section>

        <section>
          <header>
            <BookMarked :size="18" />
            <strong>复习范围</strong>
          </header>
          <label class="toggle-row">
            <input v-model="store.config.reviewOnly" type="checkbox" />
            <span>只练最近答错或熟练度低于 3 的单词</span>
          </label>
          <p class="setup-hint">错词队列当前 {{ store.overview?.reviewWords ?? 0 }} 个；没有错词时会提示重新选择全部单词。</p>
        </section>

        <section class="study-mode-summary">
          <div>
            <ListChecks :size="18" />
            <span>认词题自动生成 4 个中文选项，包含正确答案。</span>
          </div>
          <div>
            <SpellCheck :size="18" />
            <span>拼写题忽略大小写和首尾空格，必须完整拼对。</span>
          </div>
        </section>

        <p v-if="store.error" class="error-line">{{ store.error }}</p>

        <button class="btn-dark wide" type="button" :disabled="!store.canStart" @click="store.startStudySession()">
          <Play :size="18" /> 开始背词
        </button>

        <AiSettingsPanel />
        <VocabImportPanel />
      </div>
    </div>
  </section>
</template>
