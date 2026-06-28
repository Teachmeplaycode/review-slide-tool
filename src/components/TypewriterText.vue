<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
  duration: 0.62,
})

const textEl = ref<HTMLElement | null>(null)
let tween: gsap.core.Tween | null = null

watch(
  () => [props.active, props.text, props.delay, props.duration] as const,
  async ([active]) => {
    await nextTick()
    reset()
    if (active) play()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  tween?.kill()
})

function play() {
  if (!textEl.value) return

  if (prefersReducedMotion()) {
    gsap.set(textEl.value, { autoAlpha: 1, yPercent: 0 })
    return
  }

  tween = gsap.fromTo(
    textEl.value,
    { autoAlpha: 0, yPercent: -115 },
    {
      autoAlpha: 1,
      yPercent: 0,
      duration: props.duration,
      delay: props.delay,
      ease: 'power4.out',
      force3D: true,
      overwrite: true,
    },
  )
}

function reset() {
  tween?.kill()
  tween = null
  gsap.set(textEl.value, { autoAlpha: 0, yPercent: -115 })
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
</script>

<template>
  <component :is="as" class="typewriter-text" :aria-label="text">
    <span ref="textEl" class="typewriter-text__visible" aria-hidden="true">{{ text }}</span>
  </component>
</template>
