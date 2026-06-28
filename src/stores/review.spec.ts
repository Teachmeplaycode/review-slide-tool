import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudySet } from '../types'
import { useReviewStore } from './review'

vi.mock('../services/db/indexedDb', () => ({
  clearStudySets: vi.fn(() => Promise.resolve()),
  listStudySets: vi.fn(() => Promise.resolve([])),
  saveAttempt: vi.fn(() => Promise.resolve()),
  saveStudySet: vi.fn(() => Promise.resolve()),
}))

describe('review store recent study sets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens a recent study set and navigates to preview', () => {
    const store = useReviewStore()
    const studySet = makeStudySet()

    store.recentSets = [studySet]
    store.loadStudySet(studySet)

    expect(store.currentSet?.id).toBe(studySet.id)
    expect(store.slideIndex).toBe(1)
    expect(store.unlockedIndex).toBe(1)
    expect(store.quizConfig.count).toBe(1)
  })

  it('clears recent study sets and resets import state', async () => {
    const store = useReviewStore()
    const studySet = makeStudySet()

    store.recentSets = [studySet]
    store.currentSet = studySet
    store.unlockTo(2)
    await store.clearRecentSets()

    expect(store.recentSets).toEqual([])
    expect(store.currentSet).toBeNull()
    expect(store.slideIndex).toBe(0)
    expect(store.unlockedIndex).toBe(0)
  })
})

function makeStudySet(): StudySet {
  return {
    id: 'set_1',
    title: '选择题题库',
    sourceFile: '选择题题库.docx',
    createdAt: 1,
    updatedAt: 2,
    questions: [
      {
        id: 'q_1',
        type: 'choice',
        stem: '题目',
        options: [{ label: 'A', text: '选项' }],
        answer: 'A',
        raw: 'raw',
        confidence: 0.9,
        warnings: [],
        enabled: true,
      },
    ],
  }
}
