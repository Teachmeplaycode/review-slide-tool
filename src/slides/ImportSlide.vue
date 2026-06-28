<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
let entranceTimeline: gsap.core.Timeline | null = null

watch(
  () => props.active,
  async (active) => {
    if (!active) return
    await nextTick()
    replayEntrance()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  entranceTimeline?.kill()
})

function replayEntrance() {
  entranceTimeline?.kill()
  entranceTimeline = null

  if (prefersReducedMotion()) return

  const sample = samplePanel.value
  const command = commandPanel.value
  const commandItems = command?.querySelectorAll<HTMLElement>('.file-drop, .btn-dark, .recent-list, .btn-outline') ?? []
  const terminalHead = sample?.querySelector<HTMLElement>('.terminal-head--command')
  const markdownLines = sample?.querySelectorAll<HTMLElement>('.markdown-line') ?? []
  const previewItems = sample?.querySelectorAll<HTMLElement>('.markdown-preview > *') ?? []

  entranceTimeline = gsap.timeline({
    defaults: { ease: 'power3.out', overwrite: true },
  })

  if (command) {
    entranceTimeline.fromTo(command, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.48, force3D: true }, 0.2)

    if (commandItems.length) {
      entranceTimeline.fromTo(
        commandItems,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.34, stagger: 0.055, force3D: true },
        0.32,
      )
    }
  }

  if (sample) {
    entranceTimeline.fromTo(
      sample,
      { autoAlpha: 0, y: 28, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.62, force3D: true },
      0.95,
    )

    if (terminalHead) {
      entranceTimeline.fromTo(terminalHead, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.26 }, 1.07)
    }

    if (markdownLines.length) {
      entranceTimeline.fromTo(
        markdownLines,
        { autoAlpha: 0, x: -12 },
        { autoAlpha: 1, x: 0, duration: 0.26, stagger: 0.026, force3D: true },
        1.2,
      )
    }

    if (previewItems.length) {
      entranceTimeline.fromTo(
        previewItems,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.045, force3D: true },
        1.28,
      )
    }
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
</script>

<template>
  <section class="slide import-slide surface-cold">
    <div class="slide-inner import-grid">
      <div class="import-hero-row">
        <div class="hero-copy">
          <span class="section-label">Review Library</span>
          <TypewriterText as="h1" text="把固定题库变成横向复习流程" :active="active" :duration="0.72" />
          <TypewriterText
            as="p"
            text="导入带答案的 docx 或 markdown，先检查题目切分，再随机抽题、挖空默写、提交复盘。"
            :active="active"
            :delay="0.12"
            :duration="0.62"
          />
        </div>

        <div ref="samplePanel" class="import-terminal-wrap">
          <MarkdownTerminalSample />
        </div>
      </div>

      <aside ref="commandPanel" class="command-panel import-command-panel">
        <div class="import-upload-primary">
          <FileDrop :busy="store.importing" @file="store.importFile" />
          <p v-if="store.error" class="error-line">{{ store.error }}</p>
        </div>

        <div class="import-upload-side">
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
              v-for="studySet in store.recentSets.slice(0, 3)"
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

          <div class="import-upload-actions">
            <button class="btn-outline" type="button" @click="store.resetToImport">
              <RotateCcw :size="16" /> 重新选择参考
            </button>
            <button
              class="btn-dark"
              type="button"
              :disabled="!store.currentSet"
              @click="store.unlockTo(1)"
            >
              <ArrowRight :size="18" /> 下一步
            </button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
