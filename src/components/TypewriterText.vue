<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import gsap from 'gsap'

const props = withDefaults(defineProps<{
  text: string
  active: boolean
  as?: string
  delay?: number
  duration?: number
}>(), {
  as: 'p',
  delay: 0,
  duration: 0,
})

const visibleCount = ref(0)
let tween: gsap.core.Tween | null = null
let delayedCall: gsap.core.Tween | null = null

const characters = computed(() => Array.from(props.text))
const visibleText = computed(() => characters.value.slice(0, visibleCount.value).join(''))
const isComplete = computed(() => visibleCount.value >= characters.value.length)

watch(
  () => [props.active, props.text, props.delay, props.duration] as const,
  ([active]) => {
    reset()
    if (active) play()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  reset()
})

function play() {
  const total = characters.value.length
  if (total === 0) return

  if (prefersReducedMotion()) {
    visibleCount.value = total
    return
  }

  const counter = { value: 0 }
  const duration = props.duration || Math.min(2.7, Math.max(0.5, total * 0.035))

  delayedCall = gsap.delayedCall(props.delay, () => {
    tween = gsap.to(counter, {
      value: total,
      duration,
      ease: 'none',
      overwrite: true,
      onUpdate: () => {
        visibleCount.value = Math.round(counter.value)
      },
      onComplete: () => {
        visibleCount.value = total
      },
    })
  })
}

function reset() {
  tween?.kill()
  delayedCall?.kill()
  tween = null
  delayedCall = null
  visibleCount.value = 0
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
</script>

<template>
  <component :is="as" class="typewriter-text" :class="{ complete: isComplete }" :aria-label="text">
    <span class="typewriter-text__ghost" aria-hidden="true">{{ text }}</span>
    <span class="typewriter-text__visible" aria-hidden="true">
      {{ visibleText }}<span v-if="active" class="typewriter-cursor" />
    </span>
  </component>
</template>
