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
const sliding = ref(false)

gsap.registerPlugin(ScrollTrigger)

watch(
  () => props.activeIndex,
  (index) => {
    if (!track.value) return
    sliding.value = true
    gsap.to(track.value, {
      xPercent: (-100 / props.total) * index,
      duration: 0.86,
      ease: 'power4.inOut',
      force3D: true,
      autoRound: false,
      overwrite: true,
      onComplete: () => {
        sliding.value = false
        ScrollTrigger.refresh()
      },
    })
  },
)

onMounted(() => {
  window.addEventListener('wheel', onWheel, { passive: false })
  ScrollTrigger.refresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheel)
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
})

function onWheel(event: WheelEvent) {
  if (Math.abs(event.deltaY) < 35 && Math.abs(event.deltaX) < 35) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-allow-scroll="true"]')) return

  event.preventDefault()
  if (sliding.value) return
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
