<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, Combine, EyeOff, Plus, RotateCcw, Scissors, Trash2 } from 'lucide-vue-next'
import type { ParsedQuestion, QuestionOption, QuestionType } from '../types'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'
import QuestionVisualImage from './QuestionVisualImage.vue'

const props = defineProps<{
  question: ParsedQuestion
  index: number
  canMergeNext: boolean
  selected?: boolean
  assetUrl?: string
}>()

const emit = defineEmits<{
  patch: [id: string, patch: Partial<ParsedQuestion>]
  option: [id: string, optionIndex: number, patch: Partial<QuestionOption>]
  addOption: [id: string]
  removeOption: [id: string, optionIndex: number]
  split: [id: string]
  mergeNext: [id: string]
  ignore: [id: string, ignored: boolean]
}>()

const visualOnly = computed(() => isVisualOnlyQuestion(props.question))

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
  <article class="question-editor" :class="{ disabled: !question.enabled, selected, ignored: question.ignored, 'visual-only': visualOnly }">
    <header>
      <label v-if="!visualOnly" class="switch">
        <input type="checkbox" :checked="question.enabled" @change="patchEnabled" />
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
      </label>
      <span v-else class="mono visual-index">{{ String(index + 1).padStart(2, '0') }}</span>

      <div class="editor-meta">
        <span v-if="question.visual" class="page-meta">第 {{ question.visual.pageNumber }} 页</span>
        <span v-if="question.visual?.engine" class="engine-meta">{{ question.visual.engine }}</span>
        <span class="confidence">{{ Math.round(question.confidence * 100) }}%</span>
        <span v-if="question.ocrReviewState === 'needs_review'" class="warning">需确认</span>
        <span v-if="question.ignored" class="warning">已忽略</span>
        <span v-if="question.warnings.length" class="warning">{{ question.warnings[0] }}</span>
      </div>

      <span v-if="visualOnly" class="visual-type-pill">图片题</span>
      <label v-else class="select-wrap">
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

    <QuestionVisualImage
      v-if="question.visual && assetUrl"
      :visual="question.visual"
      :asset-url="assetUrl"
    />

    <p v-if="visualOnly" class="visual-editor-note">
      该题会直接以当前框选截图出题，提交后进入自评。
    </p>

    <template v-else>
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
    </template>

    <footer>
      <template v-if="!visualOnly">
        <button type="button" class="mini-command" @click="emit('split', question.id)">
          <Scissors :size="14" /> 按空行拆分答案
        </button>
        <button type="button" class="mini-command" :disabled="!canMergeNext" @click="emit('mergeNext', question.id)">
          <Combine :size="14" /> 合并下一题
        </button>
      </template>
      <button type="button" class="mini-command" @click="emit('ignore', question.id, !question.ignored)">
        <RotateCcw v-if="question.ignored" :size="14" />
        <EyeOff v-else :size="14" />
        {{ question.ignored ? '恢复题目' : '忽略题目' }}
      </button>
    </footer>
  </article>
</template>
