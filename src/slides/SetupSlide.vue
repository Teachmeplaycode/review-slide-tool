<script setup lang="ts">
import { BookOpen, Image, Play, Shuffle } from 'lucide-vue-next'
import { computed } from 'vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useReviewStore } from '../stores/review'
import type { QuestionType, ReviewMode } from '../types'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'

defineProps<{
  active: boolean
}>()

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
const visualAvailableCount = computed(() => store.availableQuizQuestions.filter((question) => isVisualOnlyQuestion(question)).length)
const onlyVisualQuestions = computed(() => store.enabledQuestions.length > 0 && store.enabledQuestions.every((question) => isVisualOnlyQuestion(question)))
const hasVisualQuestions = computed(() => visualAvailableCount.value > 0)
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
        <TypewriterText as="h2" text="按这次复习的强度抽题" :active="active" :duration="1.2" />
        <TypewriterText
          as="p"
          text="文本题按题型和复盘队列抽取；OCR 框选题直接显示裁剪图，提交后自评。"
          :active="active"
          :delay="0.42"
          :duration="1.35"
        />
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

        <section v-if="onlyVisualQuestions" class="visual-setup-note">
          <header>
            <Image :size="18" />
            <strong>图片题</strong>
          </header>
          <p>当前题库都是 OCR 框选题，抽题会直接显示用户调整后的裁剪图，不需要题型筛选和挖空设置。</p>
        </section>

        <section v-else>
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
          <p v-if="hasVisualQuestions" class="setup-hint">图片框选题会保留在抽题池中，不受题型开关影响。</p>
        </section>

        <section v-if="!onlyVisualQuestions">
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
