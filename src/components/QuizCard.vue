<script setup lang="ts">
import { computed } from 'vue'
import { Check, Circle, PenLine } from 'lucide-vue-next'
import type { QuizQuestion } from '../types'
import { splitExpectedAnswer } from '../services/grading/normalize'

const props = defineProps<{
  question: QuizQuestion
  index: number
  total: number
  value: string | string[] | undefined
}>()

const emit = defineEmits<{
  answer: [questionId: string, value: string | string[]]
}>()

const selectedText = computed(() => (Array.isArray(props.value) ? props.value.join(' ') : props.value ?? ''))
const blankCount = computed(() => {
  if (props.question.type === 'cloze') return props.question.cloze?.blanks.length ?? 0
  return Math.max(1, splitExpectedAnswer(props.question.answer).length)
})

function select(value: string) {
  emit('answer', props.question.id, value)
}

function setText(event: Event) {
  emit('answer', props.question.id, (event.target as HTMLTextAreaElement).value)
}

function setBlank(index: number, event: Event) {
  const next = Array.isArray(props.value) ? [...props.value] : Array.from({ length: blankCount.value }, () => '')
  next[index] = (event.target as HTMLInputElement).value
  emit('answer', props.question.id, next)
}

function blankValue(index: number): string {
  return Array.isArray(props.value) ? props.value[index] ?? '' : ''
}

function clozeParts(): string[] {
  return props.question.cloze?.text.split(/(\[\[blank:\d+\]\])/g) ?? []
}

function blankIndex(part: string): number {
  const match = part.match(/\[\[blank:(\d+)\]\]/)
  return Number(match?.[1] ?? 0)
}
</script>

<template>
  <article class="quiz-card">
    <header>
      <span class="mono">{{ String(index + 1).padStart(2, '0') }} / {{ total }}</span>
      <span class="type-pill">{{ question.type === 'cloze' ? '挖空默写' : question.type }}</span>
    </header>

    <h2>{{ question.stem }}</h2>

    <div v-if="question.type === 'choice'" class="choice-grid">
      <button
        v-for="option in question.options"
        :key="option.label"
        type="button"
        :class="{ selected: selectedText === option.label }"
        @click="select(option.label)"
      >
        <span>{{ option.label }}</span>
        {{ option.text }}
      </button>
    </div>

    <div v-else-if="question.type === 'true_false'" class="choice-grid compact">
      <button type="button" :class="{ selected: selectedText === '√' }" @click="select('√')">
        <Check :size="18" /> 正确
      </button>
      <button type="button" :class="{ selected: selectedText === '×' }" @click="select('×')">
        <Circle :size="18" /> 错误
      </button>
    </div>

    <div v-else-if="question.type === 'cloze'" class="cloze-answer">
      <p>
        <template v-for="(part, partIndex) in clozeParts()" :key="`${question.id}-${partIndex}`">
          <input
            v-if="part.startsWith('[[blank:')"
            :value="blankValue(blankIndex(part))"
            :aria-label="`第 ${blankIndex(part) + 1} 个空`"
            @input="setBlank(blankIndex(part), $event)"
          />
          <span v-else>{{ part }}</span>
        </template>
      </p>
    </div>

    <div v-else-if="question.type === 'blank'" class="blank-list">
      <input
        v-for="blank in blankCount"
        :key="blank"
        :value="blankValue(blank - 1)"
        :placeholder="`第 ${blank} 空`"
        @input="setBlank(blank - 1, $event)"
      />
    </div>

    <label v-else class="essay-box">
      <span><PenLine :size="16" /> 输入你的答案</span>
      <textarea :value="selectedText" rows="8" @input="setText" />
    </label>
  </article>
</template>
