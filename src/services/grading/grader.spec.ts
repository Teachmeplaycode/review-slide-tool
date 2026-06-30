import { describe, expect, it } from 'vitest'
import type { QuizQuestion } from '../../types'
import { gradeQuestion } from './grader'

const baseQuestion: QuizQuestion = {
  id: 'q1',
  type: 'short',
  sourceType: 'short',
  stem: '什么是软件危机？',
  options: [],
  answer: '软件危机是软件开发和维护过程中效率低、质量难以保障、维护困难等严重问题。',
  raw: '',
  confidence: 1,
  warnings: [],
  enabled: true,
}

describe('gradeQuestion', () => {
  it('grades choice questions by exact normalized answer', () => {
    const question: QuizQuestion = {
      ...baseQuestion,
      type: 'choice',
      sourceType: 'choice',
      options: [
        { label: 'A', text: '错误' },
        { label: 'B', text: '正确' },
      ],
      answer: 'B',
    }

    expect(gradeQuestion(question, 'B').status).toBe('correct')
    expect(gradeQuestion(question, 'A').status).toBe('wrong')
  })

  it('grades blanks by position', () => {
    const question: QuizQuestion = {
      ...baseQuestion,
      type: 'blank',
      sourceType: 'blank',
      stem: '模块独立性的两个度量标准为____和____。',
      answer: '内聚性 耦合性',
    }

    const result = gradeQuestion(question, ['内聚性', '耦合性'])
    expect(result.status).toBe('correct')
    expect(result.score).toBe(1)
  })

  it('scores short answers with similarity and keyword coverage', () => {
    const result = gradeQuestion(baseQuestion, '软件危机指开发维护中效率低、质量难保证、维护困难的问题。')
    expect(result.score).toBeGreaterThan(0.45)
    expect(['correct', 'partial']).toContain(result.status)
  })

  it('sends visual-only questions to self assessment instead of automatic grading', () => {
    const result = gradeQuestion({
      ...baseQuestion,
      visual: {
        source: 'ocr',
        assetId: 'asset_1',
        pageNumber: 1,
        pageWidth: 100,
        pageHeight: 100,
        box: { x: 0, y: 0, width: 1, height: 1 },
        lineIds: [],
        confidence: 1,
      },
    }, '')

    expect(result.status).toBe('review')
    expect(result.score).toBe(0)
    expect(result.detail).toContain('自评')
  })
})
