import type {
  AiVocabChatMessage,
  AiVocabConversationPlan,
  AiVocabDraft,
  AiVocabGenerationMode,
  AiJob,
  AiJobProgress,
  AiJobType,
  AiVocabProfile,
  AiVocabResearchResult,
  AiVocabResearchSource,
  ImportTargetMode,
  VocabImportResult,
  WordDraft,
  WordEntry,
} from '../../types'
import { requestJson } from './requestJson'

export type GenerateAiVocabPayload = Pick<AiVocabProfile, 'language' | 'topic' | 'level' | 'scenario' | 'wordCount' | 'bookName'> & {
  existingWords?: string[]
  mode?: AiVocabGenerationMode
  retrievalEnabled?: boolean
  conversation?: AiVocabChatMessage[]
  researchSources?: AiVocabResearchSource[]
}

export type PlanAiVocabPayload = {
  conversation: AiVocabChatMessage[]
  profile?: Partial<AiVocabProfile>
}

export type ResearchAiVocabPayload = {
  profile: Pick<AiVocabProfile, 'language' | 'topic' | 'level' | 'scenario' | 'wordCount' | 'bookName'>
  conversation?: AiVocabChatMessage[]
  maxResults?: number
}

export type CommitAiVocabPayload = {
  targetMode: ImportTargetMode
  bookId: string
  language: string
  bookName: string
  topic: string
  description: string
  words: WordDraft[]
}

export type AiVocabStreamStartEvent = {
  requestedCount: number
  generatedCount: number
  generatedBatches: number
  totalBatches: number
  dynamicConcurrency?: number
  activeRequests?: number
}

export type AiVocabStreamProgressEvent = {
  requestedCount: number
  generatedCount: number
  generatedBatches: number
  totalBatches: number
  currentBatch: number
  requestedBatchSize: number
  retrying?: boolean
  repairedCount?: number
  remainingCount?: number
  activeRequests?: number
  completedRequests?: number
  dynamicConcurrency?: number
}

export type AiVocabStreamBatchEvent = AiVocabDraft & {
  requestedCount: number
  generatedCount: number
  generatedBatches: number
  totalBatches: number
  requestedBatchSize?: number
  repairedCount?: number
  remainingCount?: number
  activeRequests?: number
  completedRequests?: number
  dynamicConcurrency?: number
}

export type AiVocabStreamDoneEvent = {
  requestedCount: number
  generatedCount: number
  generatedBatches: number
  totalBatches: number
  stoppedReason?: string
  status?: string
  repairedCount?: number
}

export type AiJobCreatePayload = {
  type: AiJobType
  payload: Record<string, unknown>
}

export type AiVocabStreamHandlers = {
  onStart?: (event: AiVocabStreamStartEvent) => void
  onProgress?: (event: AiVocabStreamProgressEvent) => void
  onBatch?: (event: AiVocabStreamBatchEvent) => void
  onDone?: (event: AiVocabStreamDoneEvent) => void
  onRetry?: (event: AiJobProgress & { error?: string; delayMs?: number }) => void
}

export async function planAiVocabConversation(payload: PlanAiVocabPayload): Promise<AiVocabConversationPlan> {
  return requestJson<AiVocabConversationPlan>('/api/ai/vocab/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function researchAiVocabContext(payload: ResearchAiVocabPayload): Promise<AiVocabResearchResult> {
  return requestJson<AiVocabResearchResult>('/api/ai/vocab/research', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function streamAiVocabDraft(
  payload: GenerateAiVocabPayload,
  handlers: AiVocabStreamHandlers = {},
): Promise<void> {
  const { job } = await createAiJob<WordDraft>({ type: 'generate_vocab', payload })
  await subscribeAiJobEvents(job.id, handlers)
}

export async function createAiJob<T = WordDraft | WordEntry>(payload: AiJobCreatePayload): Promise<{ job: AiJob<T> }> {
  return requestJson<{ job: AiJob<T> }>('/api/ai/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchAiJob<T = WordDraft | WordEntry>(jobId: string): Promise<AiJob<T>> {
  const payload = await requestJson<{ job: AiJob<T> }>(`/api/ai/jobs/${encodeURIComponent(jobId)}`)
  return payload.job
}

export async function cancelAiJob<T = WordDraft | WordEntry>(jobId: string): Promise<AiJob<T>> {
  const payload = await requestJson<{ job: AiJob<T> }>(`/api/ai/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return payload.job
}

export async function subscribeAiJobEvents(
  jobId: string,
  handlers: AiVocabStreamHandlers = {},
): Promise<void> {
  const response = await fetch(`/api/ai/jobs/${encodeURIComponent(jobId)}/events`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(readErrorMessage(text) || `请求失败：${response.status}`)
  }

  if (!response.body) {
    throw new Error('当前浏览器不支持流式生成')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      dispatchSseMessage(part, handlers)
    }

    if (done) break
  }

  if (buffer.trim()) {
    dispatchSseMessage(buffer, handlers)
  }
}

export async function commitAiVocabDraft(payload: CommitAiVocabPayload): Promise<VocabImportResult> {
  return requestJson<VocabImportResult>('/api/ai/vocab/commit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

function dispatchSseMessage(message: string, handlers: AiVocabStreamHandlers) {
  const lines = message.split(/\r?\n/)
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (!dataLines.length) return

  const data = JSON.parse(dataLines.join('\n'))
  if (event === 'start') {
    handlers.onStart?.(data as AiVocabStreamStartEvent)
    return
  }
  if (event === 'progress') {
    handlers.onProgress?.(data as AiVocabStreamProgressEvent)
    return
  }
  if (event === 'batch') {
    handlers.onBatch?.(data as AiVocabStreamBatchEvent)
    return
  }
  if (event === 'done') {
    handlers.onDone?.(data as AiVocabStreamDoneEvent)
    return
  }
  if (event === 'retry') {
    handlers.onRetry?.(data as AiJobProgress & { error?: string; delayMs?: number })
    return
  }
  if (event === 'error') {
    throw new Error(data?.error ?? 'AI 生成失败')
  }
}

function readErrorMessage(text: string): string {
  if (!text.trim()) return ''

  try {
    const payload = JSON.parse(text)
    return payload?.error ?? ''
  } catch {
    return text
  }
}
