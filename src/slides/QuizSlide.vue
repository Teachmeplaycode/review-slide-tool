<script setup lang="ts">
import { ArrowLeft, ArrowRight, Send } from 'lucide-vue-next'
import { computed } from 'vue'
import QuizCard from '../components/QuizCard.vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useReviewStore } from '../stores/review'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'

defineProps<{
  active: boolean
}>()

const store = useReviewStore()
const currentQuestion = computed(() => store.quizQuestions[store.activeQuestionIndex])

function isQuestionDone(question: typeof store.quizQuestions[number]): boolean {
  return isVisualOnlyQuestion(question) || Boolean(store.answers[question.id])
}
</script>

<template>
  <section class="slide surface-warm">
    <div class="slide-inner quiz-layout">
      <aside class="quiz-rail">
        <span class="section-label">Answer</span>
        <TypewriterText as="h2" text="逐题完成" :active="active" :duration="0.9" />
        <TypewriterText
          as="p"
          text="文本题完成后自动核对；图片题直接按截图作答，提交后自评。"
          :active="active"
          :delay="0.36"
          :duration="1.28"
        />
        <div class="answer-map" data-allow-scroll="true">
          <button
            v-for="(question, index) in store.quizQuestions"
            :key="question.id"
            type="button"
            :class="{ active: index === store.activeQuestionIndex, done: isQuestionDone(question) }"
            @click="store.activeQuestionIndex = index"
          >
            {{ index + 1 }}
          </button>
        </div>
      </aside>

      <div class="quiz-main">
        <QuizCard
          v-if="currentQuestion"
          :question="currentQuestion"
          :index="store.activeQuestionIndex"
          :total="store.quizQuestions.length"
          :value="store.answers[currentQuestion.id]"
          :asset-url="currentQuestion.visual ? store.assetUrls[currentQuestion.visual.assetId] : undefined"
          @answer="store.setAnswer"
        />
        <div v-else class="empty-state">
          <p>当前没有可作答题目，请返回抽题设置。</p>
          <button class="btn-dark" type="button" @click="store.goTo(2)">返回设置</button>
        </div>

        <footer class="quiz-actions">
          <button class="btn-outline" type="button" :disabled="store.activeQuestionIndex === 0" @click="store.previousQuestion">
            <ArrowLeft :size="16" /> 上一题
          </button>
          <button
            class="btn-outline"
            type="button"
            :disabled="store.activeQuestionIndex >= store.quizQuestions.length - 1"
            @click="store.nextQuestion"
          >
            下一题 <ArrowRight :size="16" />
          </button>
          <button class="btn-dark" type="button" :disabled="!store.quizQuestions.length" @click="store.submitQuiz">
            <Send :size="16" /> 提交
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>
