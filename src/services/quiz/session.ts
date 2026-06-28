import type { ParsedQuestion, QuizConfig, QuizQuestion, QuestionType } from '../../types'
import { generateCloze } from './cloze'

export function buildQuizSession(questions: ParsedQuestion[], config: QuizConfig): QuizQuestion[] {
  const allowedTypes = new Set<QuestionType>(config.types)
  const pool = questions.filter((question) => question.enabled && allowedTypes.has(question.type))
  const picked = shuffle(pool).slice(0, Math.max(1, Math.min(config.count, pool.length)))

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
