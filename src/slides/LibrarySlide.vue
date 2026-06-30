<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, BookOpen, Database, Settings } from 'lucide-vue-next'
import TypewriterText from '../components/TypewriterText.vue'
import { useVocabStore } from '../stores/vocab'

defineProps<{
  active: boolean
}>()

const store = useVocabStore()

const masteryLabel = computed(() => {
  if (!store.overview || store.overview.totalWords === 0) return '0%'
  return `${Math.round((store.overview.learnedWords / store.overview.totalWords) * 100)}%`
})
</script>

<template>
  <section class="slide surface-cold home-stage">
    <div class="slide-inner home-intro">
      <div class="home-intro__copy">
        <span class="section-label">Vocabulary Library</span>
        <TypewriterText as="h1" text="英语基础词库" :active="active" :duration="0.72" />
        <TypewriterText
          as="p"
          text="从本地 SQLite 读取词库，记录熟练度、错词和训练结果。编辑词库、导入、DeepSeek API 和音标生成统一放在右上角齿轮设置里。"
          :active="active"
          :delay="0.12"
          :duration="0.72"
        />

        <div class="home-intro__book">
          <BookOpen :size="18" />
          <div>
            <strong>{{ store.selectedBook?.name ?? '还没有词库' }}</strong>
            <span>{{ store.selectedBook?.description || '点击右上角齿轮，新建或导入一个词库。' }}</span>
          </div>
        </div>

        <dl class="vocab-stats">
          <div>
            <dt>{{ store.overview?.totalWords ?? 0 }}</dt>
            <dd>可学单词</dd>
          </div>
          <div>
            <dt>{{ store.overview?.reviewWords ?? 0 }}</dt>
            <dd>错词复习</dd>
          </div>
          <div>
            <dt>{{ masteryLabel }}</dt>
            <dd>已学习</dd>
          </div>
        </dl>

        <div class="home-intro__actions">
          <button class="btn-dark" type="button" :disabled="!store.selectedBookId" @click="store.unlockTo(1)">
            <ArrowRight :size="18" /> 进入学习设置
          </button>
          <span>
            <Settings :size="15" />
            右上角设置可管理词库和 API
          </span>
        </div>
      </div>

      <aside class="home-intro__panel">
        <Database :size="24" />
        <strong>{{ store.wordTotal }} 个当前结果</strong>
        <p v-if="store.selectedBookId">准备好后进入学习设置，选择数量、训练模式和复习范围。</p>
        <p v-else>当前没有可学习词库。请先打开右上角齿轮完成新建或导入。</p>
      </aside>
    </div>
  </section>
</template>
