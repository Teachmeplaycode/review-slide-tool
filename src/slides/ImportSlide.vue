<script setup lang="ts">
import { ArrowRight, BookOpen, Database, RotateCcw } from 'lucide-vue-next'
import FileDrop from '../components/FileDrop.vue'
import { useReviewStore } from '../stores/review'

const store = useReviewStore()
</script>

<template>
  <section class="slide import-slide surface-cold">
    <div class="slide-inner import-grid">
      <div class="hero-copy">
        <span class="section-label">Review Library</span>
        <h1>把固定题库变成横向复习流程</h1>
        <p>
          导入带答案的 docx 或 markdown，先检查题目切分，再随机抽题、挖空默写、提交复盘。
        </p>

        <div class="sample-panel">
          <div class="terminal-head">
            <span />
            <span />
            <span />
            <strong>supported-pattern.md</strong>
          </div>
          <pre><code>1.瀑布模型的存在问题是（  ）。
A.用户容易参与开发 B.缺乏灵活性
答案：B

### 1.什么是软件危机？
软件规模迅速膨胀、开发方式滞后...</code></pre>
        </div>
      </div>

      <aside class="command-panel">
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
          <header>
            <Database :size="16" />
            最近题库
          </header>
          <button
            v-for="studySet in store.recentSets.slice(0, 5)"
            :key="studySet.id"
            type="button"
            @click="store.loadStudySet(studySet)"
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
