import type { GradedQuestion, GradeStatus, QuizQuestion, UserAnswer } from '../../types'
import { jaccardSimilarity, keywordCoverage, normalizeAnswer, splitExpectedAnswer } from './normalize'

export function gradeQuiz(questions: QuizQuestion[], answers: UserAnswer[]): GradedQuestion[] {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.value]))

  return questions.map((question) => {
    const userAnswer = answerMap.get(question.id) ?? emptyAnswerFor(question)
    return gradeQuestion(question, userAnswer)
  })
}

export function gradeQuestion(question: QuizQuestion, userAnswer: string | string[]): GradedQuestion {
  if (question.type === 'choice' || question.type === 'true_false') {
    return gradeExact(question, userAnswer)
  }

  if (question.type === 'blank' || question.type === 'cloze') {
    return gradeBlank(question, userAnswer)
  }

  return gradeShort(question, userAnswer)
}

export function summarizeScore(results: GradedQuestion[]): number {
  if (results.length === 0) return 0
  const score = results.reduce((sum, result) => sum + result.score, 0) / results.length
  return Math.round(score * 100)
}

function gradeExact(question: QuizQuestion, userAnswer: string | string[]): GradedQuestion {
  const actual = normalizeAnswer(answerToText(userAnswer))
  const expected = normalizeAnswer(question.answer)
  const score = actual && actual === expected ? 1 : 0

  return {
    question,
    userAnswer,
    expectedAnswer: question.answer,
    score,
    status: score === 1 ? 'correct' : 'wrong',
    detail: score === 1 ? '答案完全匹配' : '选项与标准答案不一致',
  }
}

function gradeBlank(question: QuizQuestion, userAnswer: string | string[]): GradedQuestion {
  const expectedItems = question.type === 'cloze' && question.cloze
    ? question.cloze.blanks.map((blank) => blank.answer)
    : splitExpectedAnswer(question.answer)

  const actualItems = Array.isArray(userAnswer) ? userAnswer : splitExpectedAnswer(userAnswer)
  const matches = expectedItems.filter((expected, index) => {
    const actual = actualItems[index] ?? ''
    return normalizeAnswer(actual) === normalizeAnswer(expected)
  }).length
  const score = expectedItems.length === 0 ? 0 : matches / expectedItems.length

  return {
    question,
    userAnswer,
    expectedAnswer: expectedItems.join(' / ') || question.answer,
    score,
    status: statusFromScore(score),
    detail: `命中 ${matches}/${expectedItems.length} 个空`,
  }
}

function gradeShort(question: QuizQuestion, userAnswer: string | string[]): GradedQuestion {
  const actual = answerToText(userAnswer)
  const similarity = jaccardSimilarity(question.answer, actual)
  const coverage = keywordCoverage(question.answer, actual)
  const coverageBonus = coverage >= 0.5 ? 0.04 : 0
  const balancedBonus = similarity >= 0.25 && coverage >= 0.25 ? 0.08 : 0
  const score = Math.min(1, similarity * 0.25 + coverage * 0.75 + coverageBonus + balancedBonus)

  return {
    question,
    userAnswer,
    expectedAnswer: question.answer,
    score,
    status: statusFromScore(score),
    detail: `文本相似度 ${Math.round(similarity * 100)}%，关键词覆盖 ${Math.round(coverage * 100)}%`,
  }
}

function emptyAnswerFor(question: QuizQuestion): string | string[] {
  if (question.type === 'cloze') return question.cloze?.blanks.map(() => '') ?? []
  return ''
}

function answerToText(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join(' ') : answer
}

function statusFromScore(score: number): GradeStatus {
  if (score >= 0.85) return 'correct'
  if (score >= 0.45) return 'partial'
  if (score > 0) return 'review'
  return 'wrong'
}
