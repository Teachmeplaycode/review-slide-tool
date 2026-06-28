<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Eye, EyeOff, RotateCw, RotateCcw, Shuffle, Upload } from 'lucide-vue-next'
import ResultReview from '../components/ResultReview.vue'
import { useReviewStore } from '../stores/review'
import type { ResultFilter } from '../types'

const store = useReviewStore()
const resultList = ref<HTMLElement | null>(null)
const wrongJumpIndex = ref(0)

const filterOptions: { label: string; value: ResultFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '错题', value: 'wrong' },
  { label: '待复核', value: 'review' },
  { label: '正确', value: 'correct' },
]

const wrongCount = computed(() => store.results.filter((result) => result.status !== 'correct').length)

watch(
  () => [store.resultFilter, store.results.length],
  () => {
    wrongJumpIndex.value = 0
  },
)

async function jumpToWrong() {
  if (!wrongCount.value) return

  if (store.resultFilter !== 'wrong') {
    store.resultFilter = 'wrong'
    wrongJumpIndex.value = 0
  }

  await nextTick()
  const cards = Array.from(resultList.value?.querySelectorAll<HTMLElement>('.result-review') ?? [])
  if (!cards.length) return

  const targetIndex = wrongJumpIndex.value % cards.length
  cards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' })
  wrongJumpIndex.value = (targetIndex + 1) % cards.length
}
</script>

<template>
  <section class="slide surface-cold">
    <div class="slide-inner result-layout">
      <aside class="side-copy">
        <span class="section-label">Result</span>
        <h2>本轮得分 {{ store.score }}</h2>
        <p>
          每题都保留了你的作答和标准答案。简答题是半自动匹配，低分题建议人工复核。
        </p>
        <dl class="stats">
          <div>
            <dt>{{ store.results.filter((item) => item.status === 'correct').length }}</dt>
            <dd>正确</dd>
          </div>
          <div>
            <dt>{{ store.results.filter((item) => item.status !== 'correct').length }}</dt>
            <dd>需复盘</dd>
          </div>
        </dl>
        <button class="btn-dark" type="button" @click="store.restartRandom">
          <Shuffle :size="17" /> 再次随机抽题
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(0)">
          <Upload :size="16" /> 返回最上面重新选择
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(2)">
          <RotateCcw :size="16" /> 调整抽题设置
        </button>
      </aside>

      <div ref="resultList" class="result-list" data-allow-scroll="true">
        <div class="result-tools">
          <div class="segmented" aria-label="筛选结果">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              :class="{ active: store.resultFilter === option.value }"
              @click="store.resultFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <div class="result-tool-actions">
            <button class="mini-command" type="button" :disabled="!wrongCount" @click="jumpToWrong">
              <RotateCw :size="14" />
              跳到错题
            </button>
            <button class="mini-command" type="button" @click="store.showStandardAnswers = !store.showStandardAnswers">
              <EyeOff v-if="store.showStandardAnswers" :size="14" />
              <Eye v-else :size="14" />
              {{ store.showStandardAnswers ? '隐藏答案' : '查看答案' }}
            </button>
          </div>
        </div>

        <ResultReview
          v-for="(result, index) in store.filteredResults"
          :key="result.question.id"
          :result="result"
          :index="index"
          :show-answer="store.showStandardAnswers"
        />

        <div v-if="!store.filteredResults.length" class="empty-filter">
          当前筛选没有题目。
        </div>
      </div>
    </div>
  </section>
</template>
