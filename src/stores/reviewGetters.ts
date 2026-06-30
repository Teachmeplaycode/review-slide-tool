import type { GradedQuestion, ParsedQuestion } from '../types'
import { summarizeScore } from '../services/grading/grader'
import { isVisualOnlyQuestion } from '../services/questions/visualQuestion'
import { countReviewQueue, filterQuestionPool } from '../services/quiz/session'
import { hasAnswer } from './reviewHelpers'
import type { ReviewState } from './reviewState'

export function enabledQuestions(state: ReviewState): ParsedQuestion[] {
  return state.currentSet?.questions.filter((question) => question.enabled && !question.ignored) ?? []
}

export function totalAvailable(state: ReviewState): number {
  return enabledQuestions(state).length
}

export function reviewQueueCount(state: ReviewState): number {
  return countReviewQueue(state.currentSet?.questions ?? [], state.reviewStats)
}

export function availableQuizQuestions(state: ReviewState): ParsedQuestion[] {
  return filterQuestionPool(state.currentSet?.questions ?? [], state.quizConfig, state.reviewStats)
}

export function answeredCount(state: ReviewState): number {
  return state.quizQuestions.filter((question) => isVisualOnlyQuestion(question) || hasAnswer(state.answers[question.id])).length
}

export function score(state: ReviewState): number {
  return summarizeScore(state.results)
}

export function filteredResults(state: ReviewState): GradedQuestion[] {
  if (state.resultFilter === 'all') return state.results
  if (state.resultFilter === 'wrong') {
    return state.results.filter((result) => result.status !== 'correct')
  }
  return state.results.filter((result) => result.status === state.resultFilter)
}
