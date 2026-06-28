<script setup lang="ts">
import { ChevronDown, Combine, Plus, Scissors, Trash2 } from 'lucide-vue-next'
import type { ParsedQuestion, QuestionOption, QuestionType } from '../types'

const props = defineProps<{
  question: ParsedQuestion
  index: number
  canMergeNext: boolean
}>()

const emit = defineEmits<{
  patch: [id: string, patch: Partial<ParsedQuestion>]
  option: [id: string, optionIndex: number, patch: Partial<QuestionOption>]
  addOption: [id: string]
  removeOption: [id: string, optionIndex: number]
  split: [id: string]
  mergeNext: [id: string]
}>()

function patchText(field: 'stem' | 'answer', event: Event) {
  emit('patch', props.question.id, { [field]: (event.target as HTMLTextAreaElement).value })
}

function patchEnabled(event: Event) {
  emit('patch', props.question.id, { enabled: (event.target as HTMLInputElement).checked })
}

function patchType(event: Event) {
  emit('patch', props.question.id, { type: (event.target as HTMLSelectElement).value as QuestionType })
}

function patchOption(optionIndex: number, field: keyof QuestionOption, event: Event) {
  emit('option', props.question.id, optionIndex, { [field]: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <article class="question-editor" :class="{ disabled: !question.enabled }">
    <header>
      <label class="switch">
        <input type="checkbox" :checked="question.enabled" @change="patchEnabled" />
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
      </label>

      <div class="editor-meta">
        <span class="confidence">{{ Math.round(question.confidence * 100) }}%</span>
        <span v-if="question.warnings.length" class="warning">{{ question.warnings[0] }}</span>
      </div>

      <label class="select-wrap">
        <select :value="question.type" @change="patchType">
          <option value="choice">选择题</option>
          <option value="true_false">判断题</option>
          <option value="blank">填空题</option>
          <option value="short">简答题</option>
          <option value="cloze">挖空默写</option>
        </select>
        <ChevronDown :size="14" />
      </label>
    </header>

    <label class="field">
      <span>题干</span>
      <textarea :value="question.stem" rows="2" @input="patchText('stem', $event)" />
    </label>

    <div v-if="question.type === 'choice'" class="option-list">
      <label v-for="(option, optionIndex) in question.options" :key="`${question.id}-${optionIndex}`">
        <input
          class="option-label"
          :value="option.label"
          maxlength="2"
          @input="patchOption(optionIndex, 'label', $event)"
        />
        <input :value="option.text" @input="patchOption(optionIndex, 'text', $event)" />
        <button type="button" title="删除选项" @click="emit('removeOption', question.id, optionIndex)">
          <Trash2 :size="15" />
        </button>
      </label>
      <button type="button" class="mini-command" @click="emit('addOption', question.id)">
        <Plus :size="14" /> 添加选项
      </button>
    </div>

    <label class="field">
      <span>标准答案</span>
      <textarea :value="question.answer" rows="3" @input="patchText('answer', $event)" />
    </label>

    <footer>
      <button type="button" class="mini-command" @click="emit('split', question.id)">
        <Scissors :size="14" /> 按空行拆分答案
      </button>
      <button type="button" class="mini-command" :disabled="!canMergeNext" @click="emit('mergeNext', question.id)">
        <Combine :size="14" /> 合并下一题
      </button>
    </footer>
  </article>
</template>
