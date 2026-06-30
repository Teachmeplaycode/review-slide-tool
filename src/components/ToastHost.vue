<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
</script>

<template>
  <div v-if="toast.items.length" class="toast-stack" aria-live="polite">
    <article v-for="item in toast.items" :key="item.id" class="toast-item" :class="`toast-item--${item.kind}`">
      <CheckCircle2 v-if="item.kind === 'success'" :size="17" />
      <XCircle v-else-if="item.kind === 'error'" :size="17" />
      <Info v-else :size="17" />
      <span>{{ item.message }}</span>
      <button class="toast-item__close" type="button" title="关闭" @click="toast.dismiss(item.id)">
        <X :size="14" />
      </button>
    </article>
  </div>
</template>
