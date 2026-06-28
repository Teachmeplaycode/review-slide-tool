<script setup lang="ts">
import { BookOpen, Play, Shuffle } from 'lucide-vue-next'
import { computed } from 'vue'
import { useReviewStore } from '../stores/review'
import type { QuestionType, ReviewMode } from '../types'

const store = useReviewStore()

const typeOptions: { label: string; value: QuestionType }[] = [
  { label: '选择题', value: 'choice' },
  { label: '判断题', value: 'true_false' },
  { label: '填空题', value: 'blank' },
  { label: '简答题', value: 'short' },
]

const reviewModeOptions: { label: string; description: string; value: ReviewMode }[] = [
  { label: '全题随机', description: '从当前启用题目中随机抽取', value: 'random' },
  { label: '错题优先', description: '先抽最近答错或待复核的题', value: 'mistakes_first' },
  { label: '只练错题', description: '只抽最近一次未完全正确的题', value: 'mistakes_only' },
]

const availableCount = computed(() => store.availableQuizQuestions.length)
const maxCount = computed(() => Math.max(1, availableCount.value))
const currentCount = computed(() => Math.min(store.quizConfig.count, maxCount.value))
const countLabel = computed(() => {
  if (availableCount.value === 0) return '暂无可抽题'
  return `${Math.min(store.quizConfig.count, availableCount.value)} / ${availableCount.value}`
})

function updateCount(event: Event) {
  store.quizConfig.count = Number((event.target as HTMLInputElement).value)
}

function updateClozeRatio(event: Event) {
  store.quizConfig.clozeRatio = Number((event.target as HTMLInputElement).value)
}

function updateReviewMode(mode: ReviewMode) {
  store.setReviewMode(mode)
}
</script>

<template>
  <section class="slide surface-cold">
    <div class="slide-inner setup-grid">
      <div class="side-copy">
        <span class="section-label">Quiz Setup</span>
        <h2>按这次复习的强度抽题</h2>
        <p>
          默认随机抽题，选择题和判断题直接判分，简答题可随机变成挖空默写。
        </p>
      </div>

      <div class="setup-panel">
        <section>
          <header>
            <Shuffle :size="18" />
            <strong>题量</strong>
          </header>
          <input
            type="range"
            min="1"
            :max="maxCount"
            :value="currentCount"
            :disabled="availableCount === 0"
            @input="updateCount"
          />
          <div class="range-row">
            <span>1</span>
            <strong>{{ countLabel }}</strong>
            <span>{{ availableCount }}</span>
          </div>
        </section>

        <section>
          <header>
            <BookOpen :size="18" />
            <strong>复习队列</strong>
          </header>
          <div class="mode-grid">
            <button
              v-for="mode in reviewModeOptions"
              :key="mode.value"
              type="button"
              :class="{ active: store.quizConfig.reviewMode === mode.value }"
              @click="updateReviewMode(mode.value)"
            >
              <strong>{{ mode.label }}</strong>
              <span>{{ mode.description }}</span>
            </button>
          </div>
          <p class="setup-hint">当前需复盘 {{ store.reviewQueueCount }} 题；选择“只练错题”时会自动排除已经练对的题。</p>
        </section>

        <section>
          <header>
            <strong>题型</strong>
          </header>
          <div class="toggle-grid">
            <label v-for="type in typeOptions" :key="type.value">
              <input
                type="checkbox"
                :checked="store.quizConfig.types.includes(type.value)"
                @change="store.setTypeEnabled(type.value, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ type.label }}</span>
            </label>
          </div>
        </section>

        <section>
          <header>
            <strong>挖空默写</strong>
          </header>
          <label class="toggle-row">
            <input v-model="store.quizConfig.enableCloze" type="checkbox" />
            <span>将部分简答题改造成关键词挖空</span>
          </label>
          <input
            type="range"
            min="0.2"
            max="0.35"
            step="0.01"
            :value="store.quizConfig.clozeRatio"
            :disabled="!store.quizConfig.enableCloze"
            @input="updateClozeRatio"
          />
          <div class="range-row">
            <span>轻量</span>
            <strong>{{ Math.round(store.quizConfig.clozeRatio * 100) }}%</strong>
            <span>密集</span>
          </div>
        </section>

        <button class="btn-dark wide" type="button" :disabled="availableCount === 0" @click="store.startQuiz">
          <Play :size="18" /> 开始作答
        </button>
      </div>
    </div>
  </section>
</template>
