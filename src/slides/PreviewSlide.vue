<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, RotateCcw, Save, Settings2 } from 'lucide-vue-next'
import OcrPageInspector from '../components/OcrPageInspector.vue'
import QuestionEditor from '../components/QuestionEditor.vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useReviewStore } from '../stores/review'
import type { OcrBox, ParsedQuestion, QuestionType } from '../types'

defineProps<{
  active: boolean
}>()

type PreviewFilter = 'current' | 'all' | 'needs_review' | 'ignored'

const store = useReviewStore()
const selectedQuestionId = ref('')
const selectedPageNumber = ref(1)
const showSettings = ref(false)
const draggedQuestionId = ref('')
const previewFilter = ref<PreviewFilter>('current')
const missingOnly = ref(false)

const questions = computed(() => store.currentSet?.questions ?? [])
const ocrPages = computed(() => store.currentSet?.ocr?.pages ?? [])
const activePage = computed(() => ocrPages.value.find((page) => page.pageNumber === selectedPageNumber.value) ?? ocrPages.value[0])
const currentPageQuestions = computed(() => questions.value.filter((question) => question.visual?.pageNumber === selectedPageNumber.value))
const visibleQuestions = computed(() => {
  let items = questions.value

  if (previewFilter.value === 'current') {
    items = currentPageQuestions.value.filter((question) => !question.ignored)
  } else if (previewFilter.value === 'needs_review') {
    items = questions.value.filter((question) => question.ocrReviewState === 'needs_review' && !question.ignored)
  } else if (previewFilter.value === 'ignored') {
    items = questions.value.filter((question) => question.ignored || question.ocrReviewState === 'ignored')
  } else {
    items = questions.value.filter((question) => !question.ignored)
  }

  if (missingOnly.value) {
    items = items.filter((question) => !question.answer.trim())
  }

  return items
})

const lowConfidenceCount = computed(() => questions.value.filter((question) => question.confidence < 0.65 && !question.ignored).length)
const missingAnswerCount = computed(() => questions.value.filter((question) => !question.answer.trim() && !question.ignored).length)
const ignoredCount = computed(() => questions.value.filter((question) => question.ignored).length)
const needsReviewCount = computed(() => questions.value.filter((question) => question.ocrReviewState === 'needs_review' && !question.ignored).length)
const hasOcrPreview = computed(() => Boolean(ocrPages.value.length))
const ocrProgressText = computed(() => {
  const ocr = store.currentSet?.ocr
  if (!ocr?.status) return ''
  const current = ocr.processedPages ?? 0
  const total = ocr.totalPages ?? ocr.pages.length
  if (ocr.status === 'failed') return `OCR 扫描失败：${ocr.error || '请检查本地 OCR 引擎'}`
  if (ocr.status === 'complete') return `OCR 扫描完成：${total}/${total} 页`
  return `OCR 后台扫描中：${current}/${total} 页，已识别的题目会按页追加到右侧`
})

watch(
  ocrPages,
  (pages) => {
    if (!pages.length) return
    if (!pages.some((page) => page.pageNumber === selectedPageNumber.value)) {
      selectedPageNumber.value = pages[0].pageNumber
    }
  },
  { immediate: true },
)

watch(
  visibleQuestions,
  (items) => {
    if (!items.length) {
      selectedQuestionId.value = ''
      return
    }

    if (!items.some((question) => question.id === selectedQuestionId.value)) {
      selectQuestion(items[0])
    }
  },
  { immediate: true },
)

function selectQuestion(question: ParsedQuestion | string) {
  const item = typeof question === 'string'
    ? questions.value.find((candidate) => candidate.id === question)
    : question
  if (!item) return
  selectedQuestionId.value = item.id
  if (item.visual?.pageNumber) {
    selectedPageNumber.value = item.visual.pageNumber
  }
}

function selectPage(pageNumber: number) {
  selectedPageNumber.value = pageNumber
  previewFilter.value = 'current'
}

function addManualBox(pageNumber: number, box: OcrBox) {
  const id = store.addManualQuestionBox(pageNumber, box)
  if (id) {
    previewFilter.value = 'current'
    selectQuestion(id)
  }
}

function onDragStart(id: string, event: DragEvent) {
  draggedQuestionId.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(targetId: string) {
  if (!draggedQuestionId.value) return
  const targetIndex = questions.value.findIndex((question) => question.id === targetId)
  if (targetIndex >= 0) store.moveQuestion(draggedQuestionId.value, targetIndex)
  draggedQuestionId.value = ''
}

function questionIndex(question: ParsedQuestion): number {
  return Math.max(0, questions.value.findIndex((item) => item.id === question.id))
}

function updateMissingAnswerType(event: Event) {
  store.setMissingAnswerType((event.target as HTMLSelectElement).value as QuestionType)
}
</script>

<template>
  <section class="slide surface-warm">
    <div class="slide-inner split-layout preview-layout">
      <aside class="side-copy preview-side">
        <span class="section-label">Parse Preview</span>
        <TypewriterText as="h2" text="检查题目和答案切分" :active="active" :duration="1.15" />
        <TypewriterText
          as="p"
          text="OCR 文件按页确认题目。先处理当前页，忽略说明和封面，再进入抽题。"
          :active="active"
          :delay="0.42"
          :duration="1.45"
        />

        <dl class="stats">
          <div>
            <dt>{{ questions.length }}</dt>
            <dd>识别题目</dd>
          </div>
          <div>
            <dt>{{ store.enabledQuestions.length }}</dt>
            <dd>启用题目</dd>
          </div>
        </dl>

        <div
          v-if="ocrProgressText"
          class="ocr-progress"
          :class="{ failed: store.currentSet?.ocr?.status === 'failed' }"
        >
          {{ ocrProgressText }}
        </div>

        <OcrPageInspector
          v-if="store.currentSet?.ocr && hasOcrPreview"
          :pages="ocrPages"
          :questions="questions"
          :asset-urls="store.assetUrls"
          :selected-question-id="selectedQuestionId"
          :active-page-number="selectedPageNumber"
          :show-ignored="previewFilter === 'ignored'"
          @select="selectQuestion"
          @page="selectPage"
          @update-box="store.updateQuestionVisual"
          @ignore-question="store.setQuestionIgnored"
          @ignore-page="store.setPageIgnored"
          @rescan-page="store.requestBrowserRescan"
          @add-box="addManualBox"
        />

        <div v-if="store.browserOcrMessage" class="ocr-fallback-panel">
          <p>{{ store.browserOcrMessage }}</p>
          <button
            v-if="store.browserOcrDraft"
            type="button"
            class="mini-command"
            @click="store.adoptBrowserOcrDraft"
          >
            采用浏览器结果
          </button>
        </div>

        <button class="btn-dark" type="button" :disabled="!store.enabledQuestions.length" @click="store.finishPreview">
          <Save :size="17" /> 保存并进入抽题
        </button>
        <button class="btn-outline" type="button" @click="showSettings = !showSettings">
          <Settings2 :size="16" /> 识别设置
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(0)">
          <RotateCcw :size="16" /> 重新导入
        </button>

        <section v-if="showSettings" class="recognition-settings">
          <header>
            <strong>批量调整</strong>
            <span>{{ needsReviewCount }} 个需确认，{{ lowConfidenceCount }} 个低置信，{{ ignoredCount }} 个已忽略</span>
          </header>
          <div class="settings-actions">
            <button type="button" class="mini-command" @click="store.setPageIgnored(selectedPageNumber, true)">忽略当前页</button>
            <button type="button" class="mini-command" @click="store.setPageIgnored(selectedPageNumber, false)">恢复当前页</button>
            <button type="button" class="mini-command" @click="store.disableLowConfidence()">忽略低置信</button>
          </div>
          <label class="field compact-field">
            <span>缺答案题目改为</span>
            <select value="short" @change="updateMissingAnswerType">
              <option value="short">简答题</option>
              <option value="blank">填空题</option>
              <option value="choice">选择题</option>
            </select>
          </label>
          <label class="check-row">
            <input v-model="missingOnly" type="checkbox" />
            只显示缺答案题（{{ missingAnswerCount }}）
          </label>
        </section>
      </aside>

      <div class="editor-list" data-allow-scroll="true">
        <div class="preview-list-toolbar">
          <div class="segmented-controls">
            <button type="button" :class="{ active: previewFilter === 'current' }" @click="previewFilter = 'current'">
              当前页 {{ currentPageQuestions.filter((item) => !item.ignored).length }}
            </button>
            <button type="button" :class="{ active: previewFilter === 'all' }" @click="previewFilter = 'all'">
              全部 {{ questions.filter((item) => !item.ignored).length }}
            </button>
            <button type="button" :class="{ active: previewFilter === 'needs_review' }" @click="previewFilter = 'needs_review'">
              未确认 {{ needsReviewCount }}
            </button>
            <button type="button" :class="{ active: previewFilter === 'ignored' }" @click="previewFilter = 'ignored'">
              已忽略 {{ ignoredCount }}
            </button>
          </div>
          <span v-if="activePage" class="page-chip">第 {{ activePage.pageNumber }} 页 · {{ activePage.engine || 'pending' }}</span>
        </div>

        <div
          v-for="question in visibleQuestions"
          :key="question.id"
          class="question-editor-row"
          :class="{ dragging: draggedQuestionId === question.id }"
          draggable="true"
          @click="selectQuestion(question)"
          @dragstart="onDragStart(question.id, $event)"
          @dragend="draggedQuestionId = ''"
          @dragover.prevent
          @drop="onDrop(question.id)"
        >
          <QuestionEditor
            :question="question"
            :index="questionIndex(question)"
            :selected="selectedQuestionId === question.id"
            :asset-url="question.visual ? store.assetUrls[question.visual.assetId] : undefined"
            :can-merge-next="questionIndex(question) < questions.length - 1"
            @patch="store.updateQuestion"
            @option="store.updateOption"
            @add-option="store.addOption"
            @remove-option="store.removeOption"
            @split="store.splitQuestion"
            @merge-next="store.mergeWithNext"
            @ignore="store.setQuestionIgnored"
          />
        </div>

        <div v-if="store.currentSet && !visibleQuestions.length && store.currentSet.ocr?.status === 'processing'" class="empty-state">
          <p>当前筛选下还没有题目。OCR 正在后台逐页识别。</p>
        </div>

        <div v-else-if="store.currentSet && !visibleQuestions.length" class="empty-state">
          <p>当前筛选下没有题目。</p>
        </div>

        <div v-else-if="!store.currentSet" class="empty-state">
          <p>先导入一个题库文件。</p>
          <button class="btn-dark" type="button" @click="store.goTo(0)">
            <ArrowRight :size="16" /> 返回导入
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
