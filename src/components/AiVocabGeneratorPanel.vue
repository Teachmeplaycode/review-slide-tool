<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { CheckCircle2, Loader2, MessageSquareText, Save, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import type { AiVocabLevel, WordDraft } from '../types'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useAiVocabGeneratorStore } from '../stores/aiVocabGenerator'
import { useVocabStore } from '../stores/vocab'

const generator = useAiVocabGeneratorStore()
const aiSettings = useAiSettingsStore()
const vocab = useVocabStore()

const levelOptions: AiVocabLevel[] = ['入门', '初级', '中级', '高级', '专业']
const maxWordCount = 5000
const selectedCount = computed(() => generator.selectedWords.length)
const wordList = ref<HTMLElement | null>(null)
const saveDisabled = computed(() => {
  return !generator.canSave || (generator.targetMode === 'merge_current' && !vocab.selectedBookId)
})
const retrievalDisabled = computed(() => !aiSettings.searchSettings?.enabled || generator.generating)

onMounted(() => {
  void aiSettings.load()
})

function isSelected(word: WordDraft) {
  return generator.selectedKeys.includes(`${word.word}::${word.meaningZh}`)
}

watch(
  () => aiSettings.searchSettings?.enabled,
  (enabled) => {
    if (!enabled) generator.retrievalEnabled = false
  },
  { immediate: true },
)

watch(
  () => generator.draft?.words.length ?? 0,
  async (count, previousCount) => {
    if (count <= previousCount) return
    await nextTick()
    if (!wordList.value) return
    gsap.to(wordList.value, {
      scrollTop: wordList.value.scrollHeight,
      duration: 0.45,
      ease: 'power2.out',
      overwrite: true,
    })
  },
)
</script>

<template>
  <section class="import-panel ai-vocab-generator-panel">
    <header>
      <div>
        <Sparkles :size="18" />
        <strong>AI 生成学习库</strong>
      </div>
      <span :class="{ active: aiSettings.settings?.hasApiKey }">
        {{ aiSettings.settings?.hasApiKey ? 'DeepSeek 已配置' : '需要 API Key' }}
      </span>
    </header>

    <div class="ai-mode-switch" role="group" aria-label="AI 生成模式">
      <button
        type="button"
        :class="{ active: generator.generationMode === 'quick' }"
        @click="generator.setGenerationMode('quick')"
      >
        快速表单
      </button>
      <button
        type="button"
        :class="{ active: generator.generationMode === 'chat' }"
        @click="generator.setGenerationMode('chat')"
      >
        高级对话
      </button>
    </div>

    <section v-if="generator.generationMode === 'chat'" class="ai-chat-panel">
      <header>
        <div>
          <MessageSquareText :size="17" />
          <strong>定制需求</strong>
        </div>
        <button class="mini-command" type="button" :disabled="generator.chatPlanning" @click="generator.clearChat">
          <Trash2 :size="14" /> 清空
        </button>
      </header>

      <div v-if="generator.chatMessages.length" class="ai-chat-messages" data-allow-scroll="true">
        <article
          v-for="message in generator.chatMessages"
          :key="message.id || `${message.role}-${message.content}`"
          :class="['ai-chat-message', `ai-chat-message--${message.role}`]"
        >
          <span>{{ message.role === 'assistant' ? 'AI' : '我' }}</span>
          <p>{{ message.content }}</p>
        </article>
      </div>

      <label class="ai-chat-input">
        <span>你的想法</span>
        <textarea
          v-model="generator.chatInput"
          rows="3"
          placeholder="例如：我想做一个英语 + 日语混合的 X/Discord 热梗聊天词库，偏初中级，包含常见缩写和礼貌表达。"
        />
      </label>

      <div class="ai-chat-actions">
        <button
          class="btn-outline"
          type="button"
          :disabled="!generator.canSendChat || !aiSettings.settings?.hasApiKey"
          @click="generator.sendChatMessage"
        >
          <Loader2 v-if="generator.chatPlanning" :size="16" class="spin" />
          <MessageSquareText v-else :size="16" />
          {{ generator.chatPlanning ? '正在整理' : '发送给 AI' }}
        </button>
      </div>

      <div v-if="generator.chatPlan" class="ai-profile-card">
        <strong>需求摘要</strong>
        <dl>
          <div>
            <dt>语言</dt>
            <dd>{{ generator.profilePreview.language || '未确定' }}</dd>
          </div>
          <div>
            <dt>水平</dt>
            <dd>{{ generator.profilePreview.level }}</dd>
          </div>
          <div>
            <dt>数量</dt>
            <dd>{{ generator.profilePreview.wordCount }}</dd>
          </div>
          <div>
            <dt>场景</dt>
            <dd>{{ generator.profilePreview.scenario || '通用' }}</dd>
          </div>
        </dl>
        <p>{{ generator.profilePreview.topic }}</p>
      </div>

      <label class="toggle-row compact-toggle ai-research-toggle" :class="{ disabled: retrievalDisabled }">
        <input v-model="generator.retrievalEnabled" type="checkbox" :disabled="retrievalDisabled" />
        <span><Search :size="14" /> 实时检索</span>
      </label>
      <p v-if="!aiSettings.searchSettings?.enabled" class="setup-hint">到 API 页配置并启用 Tavily Key 后可开启检索。</p>

      <div class="ai-chat-generate">
        <button
          class="btn-outline"
          type="button"
          :disabled="!generator.canGenerate || !aiSettings.settings?.hasApiKey"
          @click="generator.generateDraft"
        >
          <Loader2 v-if="generator.generating" :size="16" class="spin" />
          <Sparkles v-else :size="16" />
          {{ generator.generating ? '正在生成' : '生成候选词条' }}
        </button>
        <p v-if="generator.generateBlockReason && aiSettings.settings?.hasApiKey" class="setup-hint">
          {{ generator.generateBlockReason }}
        </p>
      </div>
    </section>

    <form v-if="generator.generationMode === 'quick'" class="settings-form ai-vocab-form" @submit.prevent="generator.generateDraft">
      <label>
        <span>目标语言</span>
        <input v-model="generator.language" type="text" placeholder="例如：日语、法语、韩语、英语 + 日语" />
      </label>

      <label>
        <span>学习想法</span>
        <textarea
          v-model="generator.topic"
          rows="4"
          placeholder="例如：下个月去日本旅行，想先掌握点餐、问路和酒店入住常用表达"
        />
      </label>

      <div class="ai-vocab-form__row">
        <label>
          <span>水平</span>
          <select v-model="generator.level">
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label>
          <span>数量</span>
          <input v-model.number="generator.wordCount" type="number" min="5" :max="maxWordCount" />
        </label>
      </div>
      <p class="setup-hint">最多生成 {{ maxWordCount }} 个词条；系统会每 10 个词条追加一次，继续扩充时可再生成并合并到当前词库。</p>

      <label>
        <span>使用场景</span>
        <input v-model="generator.scenario" type="text" placeholder="旅行、考试、商务、社媒聊天、作品台词等" />
      </label>

      <label>
        <span>词库名称</span>
        <input v-model="generator.bookName" type="text" :placeholder="generator.effectiveBookName" />
      </label>

      <button class="btn-outline" type="submit" :disabled="!generator.canGenerate || !aiSettings.settings?.hasApiKey">
        <Loader2 v-if="generator.generating" :size="16" class="spin" />
        <Sparkles v-else :size="16" />
        {{ generator.generating ? '正在生成' : '生成候选词条' }}
      </button>
    </form>

    <p v-if="generator.generationMode === 'quick' && generator.generateBlockReason && aiSettings.settings?.hasApiKey" class="setup-hint">
      {{ generator.generateBlockReason }}
    </p>

    <section v-if="generator.generationLabel" class="ai-generation-progress">
      <header>
        <strong>{{ generator.generationLabel }}</strong>
        <span>{{ generator.generatedCount }} / {{ generator.requestedCount || generator.wordCount }}</span>
      </header>
      <div class="ai-generation-progress__bar" aria-hidden="true">
        <span :style="{ width: generator.generationProgressPercent }" />
      </div>
      <p v-if="generator.generating && !generator.generatedCount">
        首批返回前会先显示批次请求状态；每拿到 10 个词条就会自动追加到下方候选区。
      </p>
      <p v-else-if="generator.generating && generator.lastBatchSize">
        刚追加 {{ generator.lastBatchSize }} 个词条，下一批会继续异步请求。
      </p>
    </section>

    <div v-if="generator.generating && !generator.draft" class="ai-vocab-skeleton-list" aria-hidden="true">
      <div v-for="index in 3" :key="index" class="ai-vocab-skeleton">
        <span />
        <i />
        <em />
      </div>
    </div>
    <p v-if="generator.researchWarning" class="error-line">{{ generator.researchWarning }}</p>
    <p v-if="generator.error" class="error-line">{{ generator.error }}</p>
    <p v-if="!aiSettings.settings?.hasApiKey" class="setup-hint">先到 API 页保存 DeepSeek Key 后再生成。</p>

    <section v-if="generator.researchSources.length" class="ai-research-sources">
      <header>
        <div>
          <Search :size="16" />
          <strong>参考来源</strong>
        </div>
        <span>{{ generator.researchSources.length }} 条</span>
      </header>
      <p v-if="generator.researchAnswer">{{ generator.researchAnswer }}</p>
      <article v-for="source in generator.researchSources" :key="source.url">
        <a :href="source.url" target="_blank" rel="noreferrer">{{ source.title }}</a>
        <span v-if="source.publishedDate">{{ source.publishedDate }}</span>
        <p>{{ source.content }}</p>
      </article>
    </section>

    <div v-if="generator.draft" class="ai-vocab-draft">
      <header>
        <div>
          <strong>{{ generator.draft.profile.bookName }}</strong>
          <span>{{ generator.draft.profile.language }} · {{ generator.draft.words.length }} 个候选</span>
        </div>
        <div class="ai-vocab-draft__actions">
          <button class="mini-command" type="button" @click="generator.selectAllDraftWords">全选</button>
          <button class="mini-command" type="button" @click="generator.clearDraftSelection">清空</button>
        </div>
      </header>

      <div class="ai-save-mode" role="group" aria-label="保存方式">
        <button
          type="button"
          :class="{ active: generator.targetMode === 'new_book' }"
          @click="generator.targetMode = 'new_book'"
        >
          保存为新词库
        </button>
        <button
          type="button"
          :disabled="!vocab.selectedBookId"
          :class="{ active: generator.targetMode === 'merge_current' }"
          @click="generator.targetMode = 'merge_current'"
        >
          合并当前词库
        </button>
      </div>
      <p v-if="generator.targetMode === 'merge_current'" class="setup-hint">
        将合并到：{{ vocab.selectedBook?.name ?? '当前词库' }}。重复词条会自动跳过。
      </p>

      <div ref="wordList" class="ai-vocab-word-list" data-allow-scroll="true">
        <article
          v-for="word in generator.draft.words"
          :key="`${word.word}-${word.meaningZh}`"
          :class="['ai-vocab-word', { selected: isSelected(word) }]"
        >
          <input
            class="ai-vocab-word__check"
            type="checkbox"
            :checked="isSelected(word)"
            :aria-label="`选择 ${word.word}`"
            @change="generator.toggleWord(word)"
          />
          <div class="ai-vocab-word__main">
            <header>
              <strong>{{ word.word }}</strong>
              <span>{{ word.meaningZh }}</span>
            </header>
            <blockquote v-if="word.exampleEn">
              {{ word.exampleEn }}
              <span>{{ word.exampleZh }}</span>
            </blockquote>
          </div>
          <div class="ai-vocab-word__meta">
            <span v-if="word.phonetic">{{ word.phonetic }}</span>
            <span v-if="word.partOfSpeech">{{ word.partOfSpeech }}</span>
            <small>难度 {{ word.difficulty }}</small>
          </div>
        </article>
      </div>

      <footer>
        <span>{{ selectedCount }} / {{ generator.draft.words.length }} 已选</span>
        <button class="btn-dark" type="button" :disabled="saveDisabled" @click="generator.saveDraft">
          <Loader2 v-if="generator.saving" :size="16" class="spin" />
          <Save v-else :size="16" />
          {{ generator.saving ? '正在保存' : generator.targetMode === 'merge_current' ? '合并所选词条' : '保存为新词库' }}
        </button>
      </footer>
    </div>

    <div v-if="generator.result" class="import-result">
      <strong><CheckCircle2 :size="16" /> 已保存：{{ generator.result.book.name }}</strong>
      <span>{{ generator.result.book.language }} · {{ generator.result.importedCount }} 个词条</span>
    </div>
  </section>
</template>
