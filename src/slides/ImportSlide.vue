<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import gsap from 'gsap'
import { ArrowRight, BookOpen, Database, RotateCcw, Trash2 } from 'lucide-vue-next'
import FileDrop from '../components/FileDrop.vue'
import MarkdownTerminalSample from '../components/MarkdownTerminalSample.vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useReviewStore } from '../stores/review'

const props = defineProps<{
  active: boolean
}>()

const store = useReviewStore()
const samplePanel = ref<HTMLElement | null>(null)
const commandPanel = ref<HTMLElement | null>(null)

watch(
  () => props.active,
  async (active) => {
    if (!active) return
    await nextTick()
    replayEntrance()
  },
  { immediate: true },
)

function replayEntrance() {
  if (prefersReducedMotion()) return

  if (samplePanel.value) {
    gsap.fromTo(
      samplePanel.value,
      { autoAlpha: 0, y: 22, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.68, delay: 1.15, ease: 'power3.out', overwrite: true },
    )
  }

  if (commandPanel.value) {
    gsap.fromTo(
      commandPanel.value,
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.58, delay: 0.38, ease: 'power3.out', overwrite: true },
    )
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
</script>

<template>
  <section class="slide import-slide surface-cold">
    <div class="slide-inner import-grid">
      <div class="hero-copy">
        <span class="section-label">Review Library</span>
        <TypewriterText as="h1" text="把固定题库变成横向复习流程" :active="active" :duration="1.6" />
        <TypewriterText
          as="p"
          text="导入带答案的 docx 或 markdown，先检查题目切分，再随机抽题、挖空默写、提交复盘。"
          :active="active"
          :delay="0.65"
          :duration="1.7"
        />

        <div ref="samplePanel">
          <MarkdownTerminalSample />
        </div>
      </div>

      <aside ref="commandPanel" class="command-panel">
        <FileDrop :busy="store.importing" @file="store.importFile" />
        <p v-if="store.error" class="error-line">{{ store.error }}</p>

        <button
          class="btn-dark"
          type="button"
          :disabled="!store.currentSet"
          @click="store.unlockTo(1)"
        >
          <ArrowRight :size="18" /> 下一步
        </button>

        <div class="recent-list" data-allow-scroll="true">
          <header class="recent-list__header">
            <span>
              <Database :size="16" />
              最近题库
            </span>
            <button
              v-if="store.recentSets.length"
              class="recent-list__clear"
              type="button"
              title="清空最近题库"
              @click.stop="store.clearRecentSets"
            >
              <Trash2 :size="13" />
              清空
            </button>
          </header>
          <button
            v-for="studySet in store.recentSets.slice(0, 5)"
            :key="studySet.id"
            type="button"
            class="recent-list__item"
            @click.stop="store.loadStudySet(studySet)"
          >
            <BookOpen :size="15" />
            <span>{{ studySet.title }}</span>
            <small>{{ studySet.questions.length }} 题</small>
          </button>
          <p v-if="!store.recentSets.length">还没有本地题库。</p>
        </div>

        <button class="btn-outline" type="button" @click="store.resetToImport">
          <RotateCcw :size="16" /> 重新选择参考
        </button>
      </aside>
    </div>
  </section>
</template>
