import type { ParsedQuestion, QuestionReviewStat, QuizConfig, QuizQuestion, QuestionType } from '../../types'
import { generateCloze } from './cloze'

export function buildQuizSession(
  questions: ParsedQuestion[],
  config: QuizConfig,
  reviewStats: QuestionReviewStat[] = [],
): QuizQuestion[] {
  const pool = orderQuestionPool(filterQuestionPool(questions, config, reviewStats), config, reviewStats)
  const picked = pool.slice(0, Math.max(1, Math.min(config.count, pool.length)))

  return picked.map((question, index) => {
    if (shouldConvertToCloze(question, config, index)) {
      return {
        ...question,
        type: 'cloze',
        sourceType: question.type,
        cloze: generateCloze(question.answer, config.clozeRatio),
      }
    }

    return {
      ...question,
      sourceType: question.type,
    }
  })
}

export function filterQuestionPool(
  questions: ParsedQuestion[],
  config: QuizConfig,
  reviewStats: QuestionReviewStat[] = [],
): ParsedQuestion[] {
  const allowedTypes = new Set<QuestionType>(config.types)
  const pool = questions.filter((question) => question.enabled && allowedTypes.has(question.type))

  if ((config.reviewMode ?? 'random') !== 'mistakes_only') return pool

  const statsByQuestion = createStatsMap(reviewStats)
  return pool.filter((question) => needsReview(statsByQuestion.get(question.id)))
}

export function countReviewQueue(questions: ParsedQuestion[], reviewStats: QuestionReviewStat[]): number {
  const statsByQuestion = createStatsMap(reviewStats)
  return questions.filter((question) => question.enabled && needsReview(statsByQuestion.get(question.id))).length
}

function orderQuestionPool(
  questions: ParsedQuestion[],
  config: QuizConfig,
  reviewStats: QuestionReviewStat[],
): ParsedQuestion[] {
  if ((config.reviewMode ?? 'random') !== 'mistakes_first') return shuffle(questions)

  const statsByQuestion = createStatsMap(reviewStats)
  const reviewPool = questions.filter((question) => needsReview(statsByQuestion.get(question.id)))
  const regularPool = questions.filter((question) => !needsReview(statsByQuestion.get(question.id)))
  return [...shuffle(reviewPool), ...shuffle(regularPool)]
}

function createStatsMap(reviewStats: QuestionReviewStat[]): Map<string, QuestionReviewStat> {
  return new Map(reviewStats.map((stat) => [stat.questionId, stat]))
}

function needsReview(stat: QuestionReviewStat | undefined): boolean {
  return Boolean(stat && stat.lastStatus !== 'correct')
}

function shouldConvertToCloze(question: ParsedQuestion, config: QuizConfig, index: number): boolean {
  if (!config.enableCloze) return false
  if (question.type !== 'short') return false
  if (question.answer.replace(/\s+/g, '').length < 18) return false
  return index % 2 === 0
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }

  return copy
}
