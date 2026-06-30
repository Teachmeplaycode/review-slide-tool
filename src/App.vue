<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Settings } from 'lucide-vue-next'
import AppSettingsPage from './components/AppSettingsPage.vue'
import ProgressBar from './components/ProgressBar.vue'
import SlideDeck from './components/SlideDeck.vue'
import ToastHost from './components/ToastHost.vue'
import { useVocabStore } from './stores/vocab'
import LibrarySlide from './slides/LibrarySlide.vue'
import StudySetupSlide from './slides/StudySetupSlide.vue'
import TrainingSlide from './slides/TrainingSlide.vue'
import VocabularyResultSlide from './slides/VocabularyResultSlide.vue'

const store = useVocabStore()
const showSettingsPage = ref(false)
const labels = ['首页', '学习', '训练', '复盘']

onMounted(() => {
  void store.init()
})
</script>

<template>
  <ToastHost />

  <AppSettingsPage v-if="showSettingsPage" @close="showSettingsPage = false" />

  <template v-else>
    <button class="settings-gear" type="button" title="应用设置" aria-label="应用设置" @click="showSettingsPage = true">
      <Settings :size="20" />
    </button>

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
</template>
