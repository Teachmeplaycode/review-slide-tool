<script setup lang="ts">
import { computed } from 'vue'
import type { QuestionVisual } from '../types'

const props = defineProps<{
  visual: QuestionVisual
  assetUrl: string
}>()

const cropStyle = computed(() => {
  const box = props.visual.box
  const aspect = Math.max(0.25, (box.width * props.visual.pageWidth) / Math.max(1, box.height * props.visual.pageHeight))

  return {
    aspectRatio: String(aspect),
  }
})

const imageStyle = computed(() => {
  const box = props.visual.box

  return {
    left: `${-(box.x / box.width) * 100}%`,
    top: `${-(box.y / box.height) * 100}%`,
    width: `${100 / box.width}%`,
    height: `${100 / box.height}%`,
  }
})
</script>

<template>
  <figure class="question-visual" :style="cropStyle">
    <img :src="assetUrl" alt="题目截图" :style="imageStyle" />
  </figure>
</template>
