<script setup lang="ts">
import { ref } from 'vue'
import { FileText, UploadCloud } from 'lucide-vue-next'

defineProps<{
  busy: boolean
}>()

const emit = defineEmits<{
  file: [file: File]
}>()

const dragging = ref(false)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('file', file)
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}
</script>

<template>
  <label
    class="file-drop"
    :class="{ dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      type="file"
      accept=".docx,.md,.markdown,.txt,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.ppt,.pptx"
      :disabled="busy"
      @change="onInput"
    />
    <UploadCloud :size="30" aria-hidden="true" />
    <strong>{{ busy ? '正在识别...' : '选择或拖入参考文件' }}</strong>
    <span><FileText :size="14" /> 支持 docx / markdown / txt / pdf / 图片</span>
  </label>
</template>
