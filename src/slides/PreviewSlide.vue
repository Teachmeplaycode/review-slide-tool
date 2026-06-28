<script setup lang="ts">
import { ArrowRight, Save } from 'lucide-vue-next'
import QuestionEditor from '../components/QuestionEditor.vue'
import TypewriterText from '../components/TypewriterText.vue'
import { useReviewStore } from '../stores/review'

defineProps<{
  active: boolean
}>()

const store = useReviewStore()
</script>

<template>
  <section class="slide surface-warm">
    <div class="slide-inner split-layout">
      <aside class="side-copy">
        <span class="section-label">Parse Preview</span>
        <TypewriterText as="h2" text="检查题目和答案切分" :active="active" :duration="1.15" />
        <TypewriterText
          as="p"
          text="系统已经先按题号、答案标记、空格和问句特征做了一轮识别。低置信度或缺答案的题目会在卡片上提示。"
          :active="active"
          :delay="0.42"
          :duration="1.45"
        />
        <dl class="stats">
          <div>
            <dt>{{ store.currentSet?.questions.length ?? 0 }}</dt>
            <dd>识别题目</dd>
          </div>
          <div>
            <dt>{{ store.enabledQuestions.length }}</dt>
            <dd>启用题目</dd>
          </div>
        </dl>
        <button class="btn-dark" type="button" :disabled="!store.enabledQuestions.length" @click="store.finishPreview">
          <Save :size="17" /> 保存并进入抽题
        </button>
        <button class="btn-outline" type="button" @click="store.goTo(0)">
          重新导入
        </button>
      </aside>

      <div class="editor-list" data-allow-scroll="true">
        <QuestionEditor
          v-for="(question, index) in store.currentSet?.questions ?? []"
          :key="question.id"
          :question="question"
          :index="index"
          :can-merge-next="index < (store.currentSet?.questions.length ?? 0) - 1"
          @patch="store.updateQuestion"
          @option="store.updateOption"
          @add-option="store.addOption"
          @remove-option="store.removeOption"
          @split="store.splitQuestion"
          @merge-next="store.mergeWithNext"
        />

        <div v-if="!store.currentSet" class="empty-state">
          <p>先导入一个题库文件。</p>
          <button class="btn-dark" type="button" @click="store.goTo(0)">
            <ArrowRight :size="16" /> 返回导入
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
