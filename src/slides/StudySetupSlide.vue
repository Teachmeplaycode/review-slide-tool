<script setup lang="ts">
import { computed } from 'vue'
import { BookMarked, ListChecks, Minus, Play, Plus, Shuffle, SpellCheck, Target } from 'lucide-vue-next'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'
import type { StudyMode } from '../types'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()

const modeOptions: { value: StudyMode; label: string; description: string }[] = [
  { value: 'mixed', label: '混合训练', description: '认词和拼写穿插出现，适合日常学习。' },
  { value: 'recognition', label: '认词选择', description: '看目标词选中文释义，先建立熟悉度。' },
  { value: 'spelling', label: '拼写练习', description: '看中文写目标词，检查真实掌握情况。' },
]

const maxCount = computed(() => Math.max(1, store.overview?.totalWords ?? 1))
const countLabel = computed(() => `${Math.min(store.config.count, maxCount.value)} / ${maxCount.value}`)
const setupIntro = computed(() => `当前学习库为${store.selectedLanguageLabel}，系统会记录正确率、错词和熟练度。`)
const currentCount = computed(() => clampCount(store.config.count))
const quickCounts = computed(() => {
  const values = [10, 20, 50, 100].filter((count) => count < maxCount.value)
  return [...new Set([...values, maxCount.value])]
})

function clampCount(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(maxCount.value, Math.round(value)))
}

function setCount(value: number) {
  store.config.count = clampCount(value)
}

function updateCount(event: Event) {
  setCount(Number((event.target as HTMLInputElement).value))
}

function stepCount(delta: number) {
  setCount(currentCount.value + delta)
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
          :text="setupIntro"
          :active="active"
          :delay="0.38"
          :duration="1.1"
        />
        <dl class="stats">
          <div>
            <dt>{{ store.selectedBook?.wordCount ?? 0 }}</dt>
            <dd>词条总量</dd>
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
          <div class="count-picker">
            <button class="icon-command" type="button" title="减少" :disabled="currentCount <= 1" @click="stepCount(-1)">
              <Minus :size="16" />
            </button>
            <label class="count-input">
              <span>本轮数量</span>
              <input
                type="number"
                inputmode="numeric"
                min="1"
                :max="maxCount"
                :value="currentCount"
                @input="updateCount"
              />
            </label>
            <button class="icon-command" type="button" title="增加" :disabled="currentCount >= maxCount" @click="stepCount(1)">
              <Plus :size="16" />
            </button>
            <button class="mini-command" type="button" :class="{ active: currentCount === maxCount }" @click="setCount(maxCount)">
              全部
            </button>
          </div>
          <div class="count-presets">
            <button
              v-for="count in quickCounts"
              :key="count"
              type="button"
              :class="{ active: currentCount === count }"
              @click="setCount(count)"
            >
              {{ count }}
            </button>
          </div>
          <p class="setup-hint">可直接输入 1 至 {{ maxCount }} 的数字；当前 {{ countLabel }}。</p>
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
            <span>只练最近答错或熟练度低于 3 的词条</span>
          </label>
          <p class="setup-hint">错词队列当前 {{ store.overview?.reviewWords ?? 0 }} 个；没有错词时会提示重新选择全部词条。</p>
        </section>

        <section class="study-mode-summary">
          <div>
            <ListChecks :size="18" />
            <span>认词题自动生成中文选项，包含正确答案。</span>
          </div>
          <div>
            <SpellCheck :size="18" />
            <span>拼写题忽略大小写和首尾空格，必须完整写对目标词。</span>
          </div>
        </section>

        <p v-if="store.error" class="error-line">{{ store.error }}</p>

        <button class="btn-dark wide" type="button" :disabled="!store.canStart" @click="store.startStudySession()">
          <Play :size="18" /> 开始学习
        </button>
      </div>
    </div>
  </section>
</template>
