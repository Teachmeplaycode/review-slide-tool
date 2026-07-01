<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, CheckCircle2, RotateCcw, Shuffle, Sparkles, Target, Upload, XCircle } from 'lucide-vue-next'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()
const scoreTitle = computed(() => `本轮正确率 ${store.accuracy}%`)
</script>

<template>
  <section class="slide surface-warm">
    <div class="slide-inner result-layout">
      <aside class="side-copy">
        <span class="section-label">Review</span>
        <TypewriterText as="h2" :text="scoreTitle" :active="active" :duration="1.05" />
        <TypewriterText
          as="p"
          text="系统已经把本轮作答写入 SQLite，并更新每个词条的熟练度和错词状态。"
          :active="active"
          :delay="0.4"
          :duration="1.2"
        />
        <dl class="stats">
          <div>
            <dt>{{ store.answerResults.length }}</dt>
            <dd>完成</dd>
          </div>
          <div>
            <dt>{{ store.correctCount }}</dt>
            <dd>正确</dd>
          </div>
          <div>
            <dt>{{ store.wrongResults.length }}</dt>
            <dd>错词</dd>
          </div>
        </dl>
        <button class="btn-dark" type="button" :disabled="!store.wrongResults.length" @click="store.startMistakeReview">
          <Target :size="17" /> 继续错词复习
        </button>
        <button class="btn-outline" type="button" @click="store.startStudySession({ reviewOnly: false })">
          <Shuffle :size="16" /> 再来一轮
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(1)">
          <RotateCcw :size="16" /> 调整设置
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(0)">
          <Upload :size="16" /> 返回词库
        </button>
      </aside>

      <div class="result-list vocab-result-list" data-allow-scroll="true">
        <header class="result-tools">
          <div>
            <BookOpen :size="18" />
            <strong>{{ store.selectedBook?.name ?? '学习词库' }}</strong>
          </div>
          <span>平均熟练度 {{ store.overview?.averageMastery ?? 0 }}/5</span>
        </header>

        <article
          v-for="result in store.answerResults"
          :key="result.item.id"
          :class="['vocab-result-card', { wrong: !result.correct }]"
        >
          <header>
            <div>
              <CheckCircle2 v-if="result.correct" :size="18" />
              <XCircle v-else :size="18" />
              <strong>{{ result.word.word }}</strong>
              <span>{{ result.word.phonetic }}</span>
            </div>
            <small>{{ result.item.mode === 'recognition' ? '认词' : '拼写' }}</small>
          </header>
          <p>{{ result.word.partOfSpeech }} {{ result.word.meaningZh }}</p>
          <div class="answer-compare">
            <span>你的答案：{{ result.userAnswer || '未填写' }}</span>
            <span>标准答案：{{ result.correctAnswer }}</span>
          </div>
          <blockquote v-if="result.word.exampleEn">
            {{ result.word.exampleEn }}
            <span>{{ result.word.exampleZh }}</span>
          </blockquote>
          <div v-if="store.explanationForItem(result.item.id)" class="ai-explanation compact">
            <strong><Sparkles :size="14" /> AI 简析</strong>
            <p>{{ store.explanationForItem(result.item.id) }}</p>
          </div>
        </article>

        <div v-if="!store.answerResults.length" class="empty-state">
          <p>本轮还没有答题记录。</p>
          <button class="btn-dark" type="button" @click="store.goTo(1)">返回设置</button>
        </div>
      </div>
    </div>
  </section>
</template>
