<script setup lang="ts">
import { Eye, XCircle } from 'lucide-vue-next'
import type { GradedQuestion } from '../types'

defineProps<{
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
</script>

<template>
  <article class="result-review" :class="result.status">
    <header>
      <span class="mono">{{ String(index + 1).padStart(2, '0') }}</span>
      <strong>{{ statusLabel(result.status) }}</strong>
      <span>{{ Math.round(result.score * 100) }} 分</span>
    </header>

    <h3>{{ result.question.stem }}</h3>
    <div class="compare-grid">
      <section>
        <span><XCircle :size="14" /> 你的答案</span>
        <p>{{ answerText(result.userAnswer) || '未作答' }}</p>
      </section>
      <section>
        <span><Eye :size="14" /> 标准答案</span>
        <p v-if="showAnswer">{{ result.expectedAnswer }}</p>
        <p v-else class="answer-hidden">答案已隐藏，点击上方“查看答案”后显示。</p>
      </section>
    </div>
    <footer>{{ result.detail }}</footer>
  </article>
</template>
