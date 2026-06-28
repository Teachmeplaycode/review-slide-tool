<script setup lang="ts">
import { RotateCcw, Shuffle, Upload } from 'lucide-vue-next'
import ResultReview from '../components/ResultReview.vue'
import { useReviewStore } from '../stores/review'

const store = useReviewStore()
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

      <div class="result-list" data-allow-scroll="true">
        <ResultReview
          v-for="(result, index) in store.results"
          :key="result.question.id"
          :result="result"
          :index="index"
        />
      </div>
    </div>
  </section>
</template>
