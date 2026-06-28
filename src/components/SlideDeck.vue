<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const props = defineProps<{
  activeIndex: number
  maxIndex: number
  total: number
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()

const track = ref<HTMLElement | null>(null)

gsap.registerPlugin(ScrollTrigger)

watch(
  () => props.activeIndex,
  (index) => {
    if (!track.value) return
    gsap.to(track.value, {
      xPercent: (-100 / props.total) * index,
      duration: 0.72,
      ease: 'power3.inOut',
      overwrite: true,
      onComplete: () => ScrollTrigger.refresh(),
    })
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('wheel', onWheel, { passive: false })
  ScrollTrigger.refresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('wheel', onWheel)
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') navigate(1)
  if (event.key === 'ArrowLeft') navigate(-1)
}

function onWheel(event: WheelEvent) {
  if (Math.abs(event.deltaY) < 35 && Math.abs(event.deltaX) < 35) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-allow-scroll="true"]')) return

  event.preventDefault()
  navigate(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1)
}

function navigate(direction: 1 | -1) {
  const next = Math.max(0, Math.min(props.maxIndex, props.activeIndex + direction))
  if (next !== props.activeIndex) emit('navigate', next)
}
</script>

<template>
  <main class="deck" aria-live="polite">
    <div ref="track" class="deck__track" :style="{ width: `${total * 100}vw` }">
      <slot />
    </div>
  </main>
</template>
