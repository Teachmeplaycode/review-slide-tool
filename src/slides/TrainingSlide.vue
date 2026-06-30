<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ArrowRight, CheckCircle2, Send, XCircle } from 'lucide-vue-next'
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
const nextLabel = computed(() => (store.activeItemIndex >= store.studyItems.length - 1 ? '查看复盘' : '下一词'))
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
          <button
            v-for="(studyItem, index) in store.studyItems"
            :key="studyItem.id"
            type="button"
            :class="{
              active: index === store.activeItemIndex,
              done: store.answerResults.some((answer) => answer.item.id === studyItem.id),
            }"
            @click="store.setActiveItem(index)"
          >
            {{ index + 1 }}
          </button>
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

          <div class="word-prompt">
            <small>{{ item.word.partOfSpeech }} {{ item.word.phonetic }}</small>
            <h2>{{ item.prompt }}</h2>
            <p v-if="item.mode === 'recognition'">选择最匹配的中文释义。</p>
            <p v-else>输入这个中文释义对应的英文单词。</p>
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
            <span>英文拼写</span>
            <input
              v-model="store.currentAnswer"
              type="text"
              autocomplete="off"
              :disabled="Boolean(result)"
              placeholder="输入英文单词"
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
            <small>当前熟练度 {{ result.progress.mastery }}/5，累计 {{ result.progress.attempts }} 次。</small>
          </div>

          <p v-if="store.error" class="error-line">{{ store.error }}</p>

          <footer class="quiz-actions">
            <button
              class="btn-dark"
              type="button"
              :disabled="Boolean(result) || store.studying || !store.currentAnswer.trim()"
              @click="store.submitCurrentAnswer"
            >
              <Send :size="16" /> 提交答案
            </button>
            <button class="btn-outline" type="button" :disabled="!result" @click="store.nextItem">
              {{ nextLabel }} <ArrowRight :size="16" />
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
