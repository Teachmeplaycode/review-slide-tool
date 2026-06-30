import { describe, expect, it } from 'vitest'
import type { OcrPage } from '../../types'
import { imagePagesToQuestions, questionsFromOcrPages } from './ocrVisuals'

describe('ocr visual question conversion', () => {
  it('uses OCR candidate boxes as image questions and keeps recognized text as raw only', () => {
    const questions = questionsFromOcrPages([makePage()])

    expect(questions).toHaveLength(1)
    expect(questions[0].stem).toBe('第 1 页框选题 1')
    expect(questions[0].raw).toBe('1. 识别出的题干')
    expect(questions[0].answer).toBe('')
    expect(questions[0].options).toEqual([])
    expect(questions[0].ocrReviewState).toBe('confirmed')
  })

  it('creates a full-image question for image imports without OCR text', () => {
    const questions = imagePagesToQuestions([{ ...makePage(), candidates: [], lines: [] }])

    expect(questions).toHaveLength(1)
    expect(questions[0].stem).toBe('第 1 页图片题')
    expect(questions[0].visual?.box).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

function makePage(): OcrPage {
  return {
    pageNumber: 1,
    assetId: 'asset_1',
    width: 100,
    height: 100,
    engine: 'rapidocr',
    pageReviewState: 'needs_review',
    candidateCount: 1,
    lines: [
      {
        id: 'p1_l1',
        text: '1. 识别出的题干',
        confidence: 0.92,
        box: { x: 0.1, y: 0.1, width: 0.8, height: 0.1 },
      },
    ],
    candidates: [
      {
        id: 'p1_q1',
        pageNumber: 1,
        type: 'choice',
        stem: '识别出的题干',
        options: [{ label: 'A', text: '选项' }],
        answer: 'A',
        raw: '1. 识别出的题干',
        confidence: 0.92,
        warnings: ['未识别到标准答案'],
        ignored: false,
        reviewState: 'needs_review',
        engine: 'rapidocr',
        visual: {
          source: 'ocr',
          assetId: 'asset_1',
          pageNumber: 1,
          pageWidth: 100,
          pageHeight: 100,
          box: { x: 0.1, y: 0.1, width: 0.8, height: 0.1 },
          lineIds: ['p1_l1'],
          confidence: 0.92,
          engine: 'rapidocr',
        },
      },
    ],
  }
}
