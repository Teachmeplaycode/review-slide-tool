<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ArrowRight, CheckCircle2, Send, Sparkles, XCircle } from 'lucide-vue-next'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()
const item = computed(() => store.currentItem)
const result = computed(() => store.currentResult)
const progressText = computed(() => {
  if (!store.studyItems.length) return '0 / 0'
  return `${store.activeItemIndex + 1} / ${store.studyItems.length}`
})
const nextLabel = computed(() => (store.activeItemIndex >= store.studyItems.length - 1 ? '查看复盘' : '下一题'))
const spellingLabel = computed(() => `${store.selectedLanguageLabel}词条`)
const canSubmitCurrent = computed(() => {
  if (!item.value || result.value || store.studying) return false
  if (item.value.mode === 'spelling') return true
  return Boolean(store.currentAnswer.trim())
})
const answeredItemIds = computed(() => new Set(store.answerResults.map((answer) => answer.item.id)))
const answerNavEntries = computed(() => {
  const total = store.studyItems.length
  if (total <= 120) {
    return Array.from({ length: total }, (_, index) => ({ type: 'item' as const, index, key: `item-${index}` }))
  }

  const indexes = new Set<number>()
  const active = store.activeItemIndex

  for (let index = 0; index < Math.min(3, total); index += 1) indexes.add(index)
  for (let index = Math.max(0, active - 4); index <= Math.min(total - 1, active + 4); index += 1) indexes.add(index)
  for (let index = Math.max(0, total - 3); index < total; index += 1) indexes.add(index)

  const sorted = [...indexes].sort((left, right) => left - right)
  return sorted.flatMap((index, position) => {
    const previous = sorted[position - 1]
    const entries = []
    if (position > 0 && index - previous > 1) {
      entries.push({ type: 'gap' as const, key: `gap-${previous}-${index}` })
    }
    entries.push({ type: 'item' as const, index, key: `item-${index}` })
    return entries
  })
})

function isAnswered(index: number) {
  const studyItem = store.studyItems[index]
  return Boolean(studyItem && answeredItemIds.value.has(studyItem.id))
}
</script>

<template>
  <section class="slide surface-cold">
    <div class="slide-inner quiz-layout vocab-training-layout">
      <aside class="quiz-rail">
        <span class="section-label">Training</span>
        <TypewriterText as="h2" text="逐词完成训练" :active="active" :duration="0.9" />
        <TypewriterText
          as="p"
          text="提交后立即显示正确答案、例句和熟练度变化。完成本轮后进入复盘。"
          :active="active"
          :delay="0.36"
          :duration="1.15"
        />

        <div class="answer-map" data-allow-scroll="true">
          <template v-for="entry in answerNavEntries" :key="entry.key">
            <span v-if="entry.type === 'gap'" class="answer-map__gap">...</span>
            <button
              v-else
              type="button"
              :class="{
                active: entry.index === store.activeItemIndex,
                done: isAnswered(entry.index),
              }"
              @click="store.setActiveItem(entry.index)"
            >
              {{ entry.index + 1 }}
            </button>
          </template>
        </div>

        <button class="btn-outline" type="button" @click="store.goTo(1)">
          <ArrowLeft :size="16" /> 调整设置
        </button>
      </aside>

      <div class="quiz-main">
        <article v-if="item" class="word-card">
          <header>
            <span class="mono">{{ progressText }}</span>
            <span class="type-pill">{{ item.mode === 'recognition' ? '认词选择' : '拼写练习' }}</span>
          </header>

          <div class="word-card__body" data-allow-scroll="true">
            <div class="word-prompt">
              <small>{{ item.word.partOfSpeech }} {{ item.word.phonetic }}</small>
              <h2>{{ item.prompt }}</h2>
              <p v-if="item.mode === 'recognition'">选择最匹配的中文释义。</p>
              <p v-else>输入这个中文释义对应的{{ store.selectedLanguageLabel }}词条。</p>
            </div>

            <div v-if="item.mode === 'recognition'" class="choice-grid">
              <button
                v-for="choice in item.choices"
                :key="choice"
                type="button"
                :disabled="Boolean(result)"
                :class="{ selected: store.currentAnswer === choice }"
                @click="store.chooseAnswer(choice)"
              >
                {{ choice }}
              </button>
            </div>

            <label v-else class="spelling-box">
              <span>{{ spellingLabel }}</span>
              <input
                v-model="store.currentAnswer"
                type="text"
                autocomplete="off"
                :disabled="Boolean(result)"
                :placeholder="`输入${store.selectedLanguageLabel}词条`"
                @keydown.enter.prevent="store.submitCurrentAnswer"
              />
            </label>

            <div v-if="result" :class="['answer-feedback', { correct: result.correct }]">
              <div>
                <CheckCircle2 v-if="result.correct" :size="22" />
                <XCircle v-else :size="22" />
                <strong>{{ result.correct ? '回答正确' : '需要复习' }}</strong>
              </div>
              <p>正确答案：{{ result.correctAnswer }}</p>
              <p>{{ item.word.word }} {{ item.word.phonetic }}：{{ item.word.meaningZh }}</p>
              <blockquote v-if="item.word.exampleEn">
                {{ item.word.exampleEn }}
                <span>{{ item.word.exampleZh }}</span>
              </blockquote>
              <div v-if="store.explanationsLoading || store.explanationForItem(item.id)" class="ai-explanation">
                <strong><Sparkles :size="14" /> AI 简析</strong>
                <p v-if="store.explanationForItem(item.id)">{{ store.explanationForItem(item.id) }}</p>
                <p v-else>正在生成简短解析...</p>
              </div>
              <small>当前熟练度 {{ result.progress.mastery }}/5，累计 {{ result.progress.attempts }} 次。</small>
            </div>

            <p v-if="store.error" class="error-line">{{ store.error }}</p>
            <p v-if="store.explanationsError" class="error-line">{{ store.explanationsError }}</p>
          </div>

          <footer class="quiz-actions">
            <div class="quiz-actions__pager">
              <button
                class="btn-outline"
                type="button"
                :disabled="store.activeItemIndex <= 0"
                @click="store.setActiveItem(store.activeItemIndex - 1)"
              >
                <ArrowLeft :size="16" /> 上一题
              </button>
              <button class="btn-outline" type="button" :disabled="!result" @click="store.nextItem">
                {{ nextLabel }} <ArrowRight :size="16" />
              </button>
            </div>
            <button
              class="btn-dark quiz-actions__submit"
              type="button"
              :disabled="!canSubmitCurrent"
              @click="store.submitCurrentAnswer"
            >
              <Send :size="16" /> 提交答案
            </button>
          </footer>
        </article>

        <div v-else class="empty-state">
          <p>还没有学习任务，请返回学习设置。</p>
          <button class="btn-dark" type="button" @click="store.goTo(1)">返回设置</button>
        </div>
      </div>
    </div>
  </section>
</template>
