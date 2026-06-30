import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OcrPage, StudySet } from '../types'
import { recordReviewStats } from '../services/db/indexedDb'
import { setBrowserOcrAdapter } from '../services/importers/browserOcr'
import { useReviewStore } from './review'

vi.mock('../services/db/indexedDb', () => ({
  clearStudySets: vi.fn(() => Promise.resolve()),
  deleteStudyAssets: vi.fn(() => Promise.resolve()),
  listStudyAssets: vi.fn(() => Promise.resolve([])),
  listReviewStats: vi.fn(() => Promise.resolve([])),
  listStudySets: vi.fn(() => Promise.resolve([])),
  recordReviewStats: vi.fn(() => Promise.resolve()),
  saveAttempt: vi.fn(() => Promise.resolve()),
  saveStudyAssets: vi.fn(() => Promise.resolve()),
  saveStudySet: vi.fn(() => Promise.resolve()),
}))

describe('review store recent study sets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setBrowserOcrAdapter(null)
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

  it('records question review stats after submit', async () => {
    const store = useReviewStore()
    const studySet = makeStudySet()

    store.currentSet = studySet
    store.quizConfig.count = 1
    store.startQuiz()
    store.setAnswer('q_1', 'B')
    await store.submitQuiz()

    expect(recordReviewStats).toHaveBeenCalledWith(
      studySet.id,
      [expect.objectContaining({ status: 'wrong', score: 0 })],
      expect.any(Number),
    )
  })

  it('reorders questions for preview drag and later quiz order', () => {
    const store = useReviewStore()
    const studySet = makeStudySet()
    studySet.questions.push({
      ...studySet.questions[0],
      id: 'q_2',
      stem: '第二题',
    })

    store.currentSet = studySet
    store.moveQuestion('q_2', 0)

    expect(store.currentSet.questions.map((question) => question.id)).toEqual(['q_2', 'q_1'])
  })

  it('updates visual crop boxes on a question', () => {
    const store = useReviewStore()
    const studySet = makeStudySet()
    studySet.questions[0].visual = {
      source: 'ocr',
      assetId: 'asset_1',
      pageNumber: 1,
      pageWidth: 100,
      pageHeight: 100,
      lineIds: ['l1'],
      confidence: 0.8,
      box: { x: 0.1, y: 0.1, width: 0.4, height: 0.3 },
    }

    store.currentSet = studySet
    store.updateQuestionVisual('q_1', { x: 0.8, y: 0.8, width: 0.5, height: 0.5 })

    expect(store.currentSet.questions[0].visual?.source).toBe('manual')
    expect(store.currentSet.questions[0].visual?.box).toEqual({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 })
  })

  it('adds a manual OCR box as a visual-only question on the selected page', () => {
    const store = useReviewStore()
    const studySet = makeStudySet()
    const page = makeOcrPage(2, '原题', 'p2_q1')
    studySet.ocr = {
      enabled: true,
      mode: 'auto',
      sourceKind: 'pdf',
      pages: [page],
    }
    studySet.questions[0].visual = page.candidates?.[0].visual

    store.currentSet = studySet
    const id = store.addManualQuestionBox(2, { x: 0.2, y: 0.3, width: 0.35, height: 0.12 })
    const question = store.currentSet.questions.find((item) => item.id === id)

    expect(question?.stem).toBe('第 2 页框选题 2')
    expect(question?.visual?.source).toBe('manual')
    expect(question?.visual?.engine).toBe('manual')
    expect(question?.answer).toBe('')
    expect(question?.options).toEqual([])
    expect(store.currentSet.ocr?.pages[0].candidateCount).toBe(2)
  })

  it('keeps ignored questions but removes them from the enabled pool', () => {
    const store = useReviewStore()
    const studySet = makeStudySet()

    store.currentSet = studySet
    store.setQuestionIgnored('q_1', true)

    expect(store.currentSet.questions[0].ignored).toBe(true)
    expect(store.currentSet.questions[0].enabled).toBe(false)
    expect(store.enabledQuestions).toHaveLength(0)

    store.setQuestionIgnored('q_1', false)

    expect(store.currentSet.questions[0].ignored).toBe(false)
    expect(store.currentSet.questions[0].enabled).toBe(true)
    expect(store.enabledQuestions).toHaveLength(1)
  })

  it('adopts browser OCR draft by replacing questions from the same page', async () => {
    const store = useReviewStore()
    const studySet = makeStudySet()
    const page = makeOcrPage(1, '原题', 'p1_q1')
    studySet.ocr = {
      enabled: true,
      mode: 'auto',
      sourceKind: 'pdf',
      pages: [page],
    }
    studySet.questions[0].visual = page.candidates?.[0].visual
    store.currentSet = studySet
    store.assetUrls = { asset_1: 'blob:http://local/page-1' }

    setBrowserOcrAdapter(async () => makeOcrPage(1, '浏览器重扫题', 'p1_q2'))
    await store.requestBrowserRescan(1)
    await store.adoptBrowserOcrDraft()

    expect(store.currentSet.questions).toHaveLength(1)
    expect(store.currentSet.questions[0].stem).toBe('第 1 页框选题 1')
    expect(store.currentSet.questions[0].raw).toBe('浏览器重扫题')
    expect(store.currentSet.ocr?.pages[0].engine).toBe('browser_onnx')
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

function makeOcrPage(pageNumber: number, stem: string, candidateId: string): OcrPage {
  return {
    pageNumber,
    assetId: 'asset_1',
    width: 100,
    height: 100,
    engine: 'rapidocr',
    pageReviewState: 'needs_review',
    candidateCount: 1,
    lines: [
      {
        id: `p${pageNumber}_l1`,
        text: stem,
        confidence: 0.9,
        box: { x: 0.1, y: 0.1, width: 0.6, height: 0.1 },
      },
    ],
    candidates: [
      {
        id: candidateId,
        pageNumber,
        type: 'short',
        stem,
        options: [],
        answer: '',
        raw: stem,
        confidence: 0.9,
        warnings: ['未识别到标准答案'],
        ignored: false,
        reviewState: 'needs_review',
        engine: 'rapidocr',
        visual: {
          source: 'ocr',
          assetId: 'asset_1',
          pageNumber,
          pageWidth: 100,
          pageHeight: 100,
          box: { x: 0.1, y: 0.1, width: 0.6, height: 0.1 },
          lineIds: [`p${pageNumber}_l1`],
          confidence: 0.9,
          engine: 'rapidocr',
        },
      },
    ],
  }
}
