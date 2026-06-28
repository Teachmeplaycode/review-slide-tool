<script setup lang="ts">
import { onMounted } from 'vue'
import ProgressBar from './components/ProgressBar.vue'
import SlideDeck from './components/SlideDeck.vue'
import { useReviewStore } from './stores/review'
import ImportSlide from './slides/ImportSlide.vue'
import PreviewSlide from './slides/PreviewSlide.vue'
import SetupSlide from './slides/SetupSlide.vue'
import QuizSlide from './slides/QuizSlide.vue'
import ResultSlide from './slides/ResultSlide.vue'

const store = useReviewStore()
const labels = ['导入', '预览', '抽题', '作答', '复盘']

onMounted(() => {
  void store.init()
})
</script>

<template>
  <ProgressBar
    :active-index="store.slideIndex"
    :unlocked-index="store.unlockedIndex"
    :labels="labels"
    @navigate="store.goTo"
  />

  <SlideDeck
    :active-index="store.slideIndex"
    :max-index="store.unlockedIndex"
    :total="labels.length"
    @navigate="store.goTo"
  >
    <ImportSlide />
    <PreviewSlide />
    <SetupSlide />
    <QuizSlide />
    <ResultSlide />
  </SlideDeck>
</template>
