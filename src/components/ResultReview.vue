<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, Eye, RotateCcw, XCircle } from 'lucide-vue-next'
import type { GradeStatus, GradedQuestion } from '../types'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'
import QuestionVisualImage from './QuestionVisualImage.vue'

const props = defineProps<{
  result: GradedQuestion
  index: number
  showAnswer: boolean
  assetUrl?: string
}>()

const emit = defineEmits<{
  selfAssess: [questionId: string, status: 'correct' | 'review' | 'wrong']
}>()

const visualOnly = computed(() => isVisualOnlyQuestion(props.result.question))

function answerText(value: string | string[]): string {
  return Array.isArray(value) ? value.join(' / ') : value
}

function statusLabel(status: GradeStatus): string {
  if (visualOnly.value) {
    const visualLabels = {
      correct: '已掌握',
      partial: '部分掌握',
      review: '待自评',
      wrong: '未掌握',
    }
    return visualLabels[status]
  }

  const labels = {
    correct: '正确',
    partial: '部分正确',
    review: '待复核',
    wrong: '错误',
  }
  return labels[status]
}

function answerLabels(value: string | string[]): string[] {
  return answerText(value)
    .split(/[、,，/;\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
}

function isUserOption(label: string): boolean {
  return answerLabels(props.result.userAnswer).includes(label.toUpperCase())
}

function isExpectedOption(label: string): boolean {
  return answerLabels(props.result.expectedAnswer).includes(label.toUpperCase())
}
</script>

<template>
  <article class="result-review" :class="props.result.status">
    <header>
      <span class="mono">{{ String(props.index + 1).padStart(2, '0') }}</span>
      <strong>{{ statusLabel(props.result.status) }}</strong>
      <span v-if="visualOnly">自评</span>
      <span v-else>{{ Math.round(props.result.score * 100) }} 分</span>
    </header>

    <h3>{{ props.result.question.stem }}</h3>

    <QuestionVisualImage
      v-if="props.result.question.visual && props.assetUrl"
      :visual="props.result.question.visual"
      :asset-url="props.assetUrl"
    />

    <div v-if="visualOnly" class="self-assess-panel">
      <p>图片题暂不自动评分，请按实际掌握情况标记。</p>
      <div class="self-assess-actions">
        <button type="button" :class="{ active: props.result.status === 'correct' }" @click="emit('selfAssess', props.result.question.id, 'correct')">
          <CheckCircle2 :size="15" /> 掌握
        </button>
        <button type="button" :class="{ active: props.result.status === 'review' }" @click="emit('selfAssess', props.result.question.id, 'review')">
          <RotateCcw :size="15" /> 待复习
        </button>
        <button type="button" :class="{ active: props.result.status === 'wrong' }" @click="emit('selfAssess', props.result.question.id, 'wrong')">
          <XCircle :size="15" /> 未掌握
        </button>
      </div>
    </div>

    <template v-else>
      <div v-if="props.showAnswer && props.result.question.options.length" class="result-options">
        <span class="result-options__label">选项</span>
        <div class="result-options__grid">
          <div
            v-for="option in props.result.question.options"
            :key="option.label"
            class="result-option"
            :class="{ user: isUserOption(option.label), expected: isExpectedOption(option.label) }"
          >
            <strong>{{ option.label }}</strong>
            <p>{{ option.text }}</p>
            <em v-if="isExpectedOption(option.label)">标准答案</em>
            <em v-else-if="isUserOption(option.label)">你的选项</em>
          </div>
        </div>
      </div>

      <div class="compare-grid">
        <section>
          <span><XCircle :size="14" /> 你的答案</span>
          <p>{{ answerText(props.result.userAnswer) || '未作答' }}</p>
        </section>
        <section>
          <span><Eye :size="14" /> 标准答案</span>
          <p v-if="props.showAnswer">{{ props.result.expectedAnswer }}</p>
          <p v-else class="answer-hidden">答案已隐藏，点击上方“查看答案”后显示。</p>
        </section>
      </div>
    </template>

    <footer>{{ props.result.detail }}</footer>
  </article>
</template>
