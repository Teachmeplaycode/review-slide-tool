<script setup lang="ts">
import { computed, ref } from 'vue'
import { EyeOff, Plus, RefreshCw, RotateCcw } from 'lucide-vue-next'
import type { OcrBox, OcrPage, ParsedQuestion } from '../types'

const props = defineProps<{
  pages: OcrPage[]
  questions: ParsedQuestion[]
  assetUrls: Record<string, string>
  selectedQuestionId: string
  activePageNumber: number
  showIgnored: boolean
}>()

const emit = defineEmits<{
  select: [question: ParsedQuestion]
  page: [pageNumber: number]
  updateBox: [id: string, box: OcrBox]
  ignoreQuestion: [id: string, ignored: boolean]
  ignorePage: [pageNumber: number, ignored: boolean]
  rescanPage: [pageNumber: number]
  addBox: [pageNumber: number, box: OcrBox]
}>()

type DragMode = 'move' | 'resize'

type DragState = {
  id: string
  mode: DragMode
  startX: number
  startY: number
  startBox: OcrBox
  bounds: DOMRect
}

const dragState = ref<DragState | null>(null)
const addMode = ref(false)
const draftBox = ref<OcrBox | null>(null)
const drawState = ref<{
  startX: number
  startY: number
  bounds: DOMRect
  pointerId: number
  stage: HTMLElement
} | null>(null)

const activePage = computed(() => props.pages.find((page) => page.pageNumber === props.activePageNumber) ?? props.pages[0])
const allPageQuestions = computed(() => props.questions.filter((question) => question.visual?.pageNumber === activePage.value?.pageNumber))
const pageQuestions = computed(() => props.questions.filter((question) => {
  if (question.visual?.pageNumber !== activePage.value?.pageNumber) return false
  return props.showIgnored ? Boolean(question.ignored) : !question.ignored
}))
const activeAssetUrl = computed(() => activePage.value ? props.assetUrls[activePage.value.assetId] : '')
const activePageIgnored = computed(() => allPageQuestions.value.length > 0 && allPageQuestions.value.every((question) => question.ignored))

function pageQuestionCount(pageNumber: number): number {
  return props.questions.filter((question) => question.visual?.pageNumber === pageNumber && !question.ignored).length
}

function boxStyle(box: OcrBox) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  }
}

function selectPage(event: Event) {
  emit('page', Number((event.target as HTMLSelectElement).value))
}

function startDrag(event: PointerEvent, question: ParsedQuestion, mode: DragMode) {
  if (!question.visual || question.ignored) return

  const stage = (event.currentTarget as HTMLElement).closest<HTMLElement>('.ocr-page-stage')
  if (!stage) return

  event.preventDefault()
  event.stopPropagation()
  emit('select', question)
  dragState.value = {
    id: question.id,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    startBox: { ...question.visual.box },
    bounds: stage.getBoundingClientRect(),
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag, { once: true })
}

function startAddBox(event: PointerEvent) {
  if (!addMode.value || !activePage.value) return
  if (event.button !== 0) return

  const stage = event.currentTarget as HTMLElement
  const bounds = stage.getBoundingClientRect()
  const point = pointInStage(event, bounds)

  event.preventDefault()
  stage.setPointerCapture?.(event.pointerId)
  draftBox.value = { x: point.x, y: point.y, width: 0.001, height: 0.001 }
  drawState.value = {
    startX: point.x,
    startY: point.y,
    bounds,
    pointerId: event.pointerId,
    stage,
  }

  window.addEventListener('pointermove', onDrawMove)
  window.addEventListener('pointerup', stopAddBox, { once: true })
  window.addEventListener('pointercancel', stopAddBox, { once: true })
  window.addEventListener('blur', cancelAddBox, { once: true })
}

function onDrawMove(event: PointerEvent) {
  const state = drawState.value
  if (!state) return
  const point = pointInStage(event, state.bounds)
  const left = Math.min(state.startX, point.x)
  const top = Math.min(state.startY, point.y)
  const right = Math.max(state.startX, point.x)
  const bottom = Math.max(state.startY, point.y)

  draftBox.value = normalizeBox({
    x: left,
    y: top,
    width: Math.max(0.001, right - left),
    height: Math.max(0.001, bottom - top),
  })
}

function stopAddBox() {
  const box = draftBox.value
  const pageNumber = activePage.value?.pageNumber

  cleanupAddBoxListeners()
  drawState.value = null
  draftBox.value = null

  if (!box || !pageNumber) return
  if (box.width < 0.02 || box.height < 0.02) return
  emit('addBox', pageNumber, normalizeBox(box))
  addMode.value = false
}

function cancelAddBox() {
  cleanupAddBoxListeners()
  drawState.value = null
  draftBox.value = null
}

function cleanupAddBoxListeners() {
  const state = drawState.value
  if (state?.stage.hasPointerCapture?.(state.pointerId)) {
    state.stage.releasePointerCapture(state.pointerId)
  }
  window.removeEventListener('pointermove', onDrawMove)
  window.removeEventListener('pointerup', stopAddBox)
  window.removeEventListener('pointercancel', stopAddBox)
  window.removeEventListener('blur', cancelAddBox)
}

function onPointerMove(event: PointerEvent) {
  const state = dragState.value
  if (!state) return

  const dx = (event.clientX - state.startX) / state.bounds.width
  const dy = (event.clientY - state.startY) / state.bounds.height
  const start = state.startBox
  const next = state.mode === 'move'
    ? {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    }
    : {
      ...start,
      width: clamp(start.width + dx, 0.02, 1 - start.x),
      height: clamp(start.height + dy, 0.02, 1 - start.y),
    }

  emit('updateBox', state.id, normalizeBox(next))
}

function stopDrag() {
  dragState.value = null
  window.removeEventListener('pointermove', onPointerMove)
}

function normalizeBox(box: OcrBox): OcrBox {
  return {
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Number(value.toFixed(6))
}

function pointInStage(event: PointerEvent, bounds: DOMRect): { x: number, y: number } {
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
  }
}
</script>

<template>
  <section v-if="activePage" class="ocr-inspector">
    <header>
      <strong>OCR 框选</strong>
      <label>
        <span>页</span>
        <select :value="activePage.pageNumber" @change="selectPage">
          <option v-for="page in pages" :key="page.pageNumber" :value="page.pageNumber">
            第 {{ page.pageNumber }} 页 · {{ pageQuestionCount(page.pageNumber) }} 题 · {{ page.pageReviewState || '扫描中' }}
          </option>
        </select>
      </label>
    </header>

    <div class="ocr-page-actions">
      <button type="button" class="mini-command" @click="emit('ignorePage', activePage.pageNumber, true)">
        <EyeOff :size="14" /> 忽略本页
      </button>
      <button type="button" class="mini-command" :disabled="!activePageIgnored" @click="emit('ignorePage', activePage.pageNumber, false)">
        <RotateCcw :size="14" /> 恢复本页
      </button>
      <button type="button" class="mini-command" @click="emit('rescanPage', activePage.pageNumber)">
        <RefreshCw :size="14" /> 重扫本页
      </button>
      <button type="button" class="mini-command" :class="{ active: addMode }" @click="addMode = !addMode">
        <Plus :size="14" /> {{ addMode ? (draftBox ? '松开完成' : '退出添加') : '添加框选' }}
      </button>
    </div>

    <div
      class="ocr-page-stage"
      :class="{ adding: addMode }"
      :style="{ aspectRatio: `${activePage.width} / ${activePage.height}` }"
      @pointerdown="startAddBox"
    >
      <img v-if="activeAssetUrl" :src="activeAssetUrl" alt="OCR 页面预览" />
      <div
        v-for="question in pageQuestions"
        :key="question.id"
        class="ocr-box"
        :class="{ selected: question.id === selectedQuestionId, ignored: question.ignored }"
        :style="question.visual ? boxStyle(question.visual.box) : undefined"
        @pointerdown="startDrag($event, question, 'move')"
      >
        <span>{{ questions.findIndex((item) => item.id === question.id) + 1 }}</span>
        <button
          type="button"
          class="ocr-box__ignore"
          :aria-label="question.ignored ? '恢复题目' : '忽略题目'"
          @pointerdown.stop
          @click.stop="emit('ignoreQuestion', question.id, !question.ignored)"
        >
          {{ question.ignored ? '恢复' : '忽略' }}
        </button>
        <button type="button" class="ocr-box__resize" aria-label="调整框大小" @pointerdown="startDrag($event, question, 'resize')" />
      </div>
      <div
        v-if="draftBox"
        class="ocr-box ocr-box--draft"
        :style="boxStyle(draftBox)"
      />
    </div>

    <p>当前页只显示对应题目；拖动框移动，拖动右下角调整大小。点击“添加框选”后按住拖出遗漏题目，松开后自动新增。</p>
  </section>
</template>
