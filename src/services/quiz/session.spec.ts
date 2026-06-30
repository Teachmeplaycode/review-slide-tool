import { describe, expect, it } from 'vitest'
import type { ParsedQuestion, QuestionReviewStat, QuizConfig } from '../../types'
import { buildQuizSession, countReviewQueue, filterQuestionPool } from './session'

const baseConfig: QuizConfig = {
  count: 3,
  types: ['choice', 'true_false', 'blank', 'short'],
  enableCloze: false,
  clozeRatio: 0.3,
  reviewMode: 'random',
}

describe('review queue quiz session', () => {
  it('filters to latest non-correct questions in mistakes-only mode', () => {
    const pool = filterQuestionPool(questions, { ...baseConfig, reviewMode: 'mistakes_only' }, reviewStats)

    expect(pool.map((question) => question.id).sort()).toEqual(['q2', 'q3'])
    expect(countReviewQueue(questions, reviewStats)).toBe(2)
  })

  it('prioritizes review questions before regular random fill', () => {
    const session = buildQuizSession(questions, { ...baseConfig, count: 4, reviewMode: 'mistakes_first' }, reviewStats)
    const firstTwo = session.slice(0, 2).map((question) => question.id).sort()

    expect(firstTwo).toEqual(['q2', 'q3'])
    expect(session).toHaveLength(4)
  })

  it('removes corrected questions from the review queue', () => {
    const correctedStats = reviewStats.map((stat) => (
      stat.questionId === 'q2'
        ? { ...stat, lastStatus: 'correct' as const, correctStreak: 1 }
        : stat
    ))
    const pool = filterQuestionPool(questions, { ...baseConfig, reviewMode: 'mistakes_only' }, correctedStats)

    expect(pool.map((question) => question.id)).toEqual(['q3'])
    expect(countReviewQueue(questions, correctedStats)).toBe(1)
  })

  it('excludes ignored questions from quiz and review pools', () => {
    const ignoredQuestions = questions.map((question) => (
      question.id === 'q2'
        ? { ...question, ignored: true, enabled: false }
        : question
    ))
    const pool = filterQuestionPool(ignoredQuestions, { ...baseConfig, reviewMode: 'mistakes_only' }, reviewStats)

    expect(pool.map((question) => question.id)).toEqual(['q3'])
    expect(countReviewQueue(ignoredQuestions, reviewStats)).toBe(1)
  })

  it('keeps visual-only questions in the pool regardless of text type filters', () => {
    const visualQuestion: ParsedQuestion = {
      ...makeQuestion('q5', ''),
      type: 'short',
      options: [],
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
    }
    const pool = filterQuestionPool(
      [...questions, visualQuestion],
      { ...baseConfig, types: ['choice'] },
      [],
    )

    expect(pool.map((question) => question.id)).toContain('q5')
  })
})

const questions: ParsedQuestion[] = [
  makeQuestion('q1', 'A'),
  makeQuestion('q2', 'B'),
  makeQuestion('q3', 'C'),
  makeQuestion('q4', 'D'),
]

const reviewStats: QuestionReviewStat[] = [
  makeStat('q1', 'correct', 1),
  makeStat('q2', 'wrong', 0),
  makeStat('q3', 'review', 0.3),
]

function makeQuestion(id: string, answer: string): ParsedQuestion {
  return {
    id,
    type: 'choice',
    stem: `题目 ${id}`,
    options: [
      { label: 'A', text: '选项 A' },
      { label: 'B', text: '选项 B' },
    ],
    answer,
    raw: '',
    confidence: 1,
    warnings: [],
    enabled: true,
  }
}

function makeStat(questionId: string, lastStatus: QuestionReviewStat['lastStatus'], lastScore: number): QuestionReviewStat {
  return {
    id: `set_1::${questionId}`,
    studySetId: 'set_1',
    questionId,
    attempts: 1,
    correctCount: lastStatus === 'correct' ? 1 : 0,
    reviewCount: lastStatus === 'review' || lastStatus === 'partial' ? 1 : 0,
    wrongCount: lastStatus === 'wrong' ? 1 : 0,
    correctStreak: lastStatus === 'correct' ? 1 : 0,
    lastStatus,
    lastScore,
    lastAttemptAt: 1,
    updatedAt: 1,
  }
}
