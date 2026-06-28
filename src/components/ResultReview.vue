<script setup lang="ts">
import { Eye, XCircle } from 'lucide-vue-next'
import type { GradedQuestion } from '../types'

const props = defineProps<{
  result: GradedQuestion
  index: number
  showAnswer: boolean
}>()

function answerText(value: string | string[]): string {
  return Array.isArray(value) ? value.join(' / ') : value
}

function statusLabel(status: GradedQuestion['status']): string {
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
      <span>{{ Math.round(props.result.score * 100) }} 分</span>
    </header>

    <h3>{{ props.result.question.stem }}</h3>

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
    <footer>{{ props.result.detail }}</footer>
  </article>
</template>
