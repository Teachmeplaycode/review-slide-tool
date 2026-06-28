<script setup lang="ts">
const props = defineProps<{
  activeIndex: number
  unlockedIndex: number
  labels: string[]
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()

function progressWidth(): string {
  const denominator = Math.max(1, props.labels.length - 1)
  return `${(props.activeIndex / denominator) * 100}%`
}
</script>

<template>
  <nav class="progress" aria-label="复习流程">
    <div class="progress__bar">
      <span :style="{ width: progressWidth() }" />
    </div>
    <div class="progress__steps">
      <button
        v-for="(label, index) in labels"
        :key="label"
        type="button"
        :class="{ active: index === activeIndex, unlocked: index <= unlockedIndex }"
        :disabled="index > unlockedIndex"
        @click="emit('navigate', index)"
      >
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        {{ label }}
      </button>
    </div>
  </nav>
</template>
