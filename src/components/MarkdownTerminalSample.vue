<script setup lang="ts">
import { computed } from 'vue'

const source = `## 1. 瀑布模型的存在问题是（  ）。
A. 用户容易参与开发
B. 缺乏灵活性
答案：B
`

type PreviewLine = {
  kind: 'heading' | 'answer' | 'option' | 'paragraph' | 'blank'
  label?: string
  text: string
}

const sourceLines = computed(() => source.split('\n'))
const previewLines = computed<PreviewLine[]>(() => sourceLines.value.map((line) => {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'blank', text: '' }

  const heading = trimmed.match(/^#{1,6}\s+(.+)$/)
  if (heading) return { kind: 'heading', text: heading[1] }

  const option = trimmed.match(/^([A-H])\.\s*(.+)$/i)
  if (option) return { kind: 'option', label: option[1].toUpperCase(), text: option[2] }

  const answer = trimmed.match(/^(答案|回答)\s*[:：]\s*(.+)$/)
  if (answer) return { kind: 'answer', label: answer[1], text: answer[2] }

  return { kind: 'paragraph', text: trimmed }
}))

function tokenClass(line: string): string {
  const trimmed = line.trim()
  if (/^#{1,6}\s+/.test(trimmed)) return 'markdown-token heading'
  if (/^([A-H])\.\s*/i.test(trimmed)) return 'markdown-token option'
  if (/^(答案|回答)\s*[:：]/.test(trimmed)) return 'markdown-token answer'
  return 'markdown-token'
}
</script>

<template>
  <div class="sample-panel markdown-terminal">
    <div class="terminal-head terminal-head--command">
      <div class="terminal-lights" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>

    <div class="markdown-sample">
      <pre class="markdown-source" aria-label="Markdown 示例源码"><code><span
        v-for="(line, index) in sourceLines"
        :key="`${index}-${line}`"
        class="markdown-line"
      ><span class="line-number">{{ String(index + 1).padStart(2, '0') }}</span><span :class="tokenClass(line)">{{ line || ' ' }}</span></span></code></pre>

      <div class="markdown-preview" aria-label="Markdown 预览">
        <template v-for="(line, index) in previewLines" :key="`${index}-${line.kind}`">
          <h3 v-if="line.kind === 'heading'">{{ line.text }}</h3>
          <p v-else-if="line.kind === 'paragraph'">{{ line.text }}</p>
          <div v-else-if="line.kind === 'option'" class="preview-option">
            <span>{{ line.label }}</span>
            <p>{{ line.text }}</p>
          </div>
          <div v-else-if="line.kind === 'answer'" class="preview-answer">
            <span>{{ line.label }}</span>
            <strong>{{ line.text }}</strong>
          </div>
          <div v-else class="preview-gap" />
        </template>
      </div>
    </div>
  </div>
</template>
