<script setup lang="ts">
import { onMounted } from 'vue'
import ProgressBar from './components/ProgressBar.vue'
import SlideDeck from './components/SlideDeck.vue'
import { useVocabStore } from './stores/vocab'
import LibrarySlide from './slides/LibrarySlide.vue'
import StudySetupSlide from './slides/StudySetupSlide.vue'
import TrainingSlide from './slides/TrainingSlide.vue'
import VocabularyResultSlide from './slides/VocabularyResultSlide.vue'

const store = useVocabStore()
const labels = ['词库', '设置', '训练', '复盘']

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
    <LibrarySlide :active="store.slideIndex === 0" />
    <StudySetupSlide :active="store.slideIndex === 1" />
    <TrainingSlide :active="store.slideIndex === 2" />
    <VocabularyResultSlide :active="store.slideIndex === 3" />
  </SlideDeck>
</template>
