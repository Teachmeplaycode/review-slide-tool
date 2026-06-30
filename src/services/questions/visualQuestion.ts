import type { ParsedQuestion, QuizQuestion } from '../../types'

type VisualQuestion = Pick<ParsedQuestion, 'visual'>

export function isVisualOnlyQuestion(question: VisualQuestion): boolean {
  return Boolean(question.visual && question.visual.source !== 'synthetic_text')
}

export function visualQuestionStem(pageNumber: number, ordinal: number): string {
  return `第 ${pageNumber} 页框选题 ${ordinal}`
}

export function normalizeVisualOnlyQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
  const pageCounts = new Map<number, number>()

  return questions.map((question) => {
    if (!isVisualOnlyQuestion(question) || !question.visual) return question

    const nextOrdinal = (pageCounts.get(question.visual.pageNumber) ?? 0) + 1
    pageCounts.set(question.visual.pageNumber, nextOrdinal)
    const ignored = question.ignored || question.ocrReviewState === 'ignored'

    return {
      ...question,
      type: 'short',
      stem: visualQuestionStem(question.visual.pageNumber, nextOrdinal),
      options: [],
      answer: '',
      warnings: question.warnings.filter((warning) => warning !== '未识别到标准答案'),
      enabled: !ignored,
      ignored,
      ocrReviewState: ignored ? 'ignored' : 'confirmed',
    }
  })
}

export function visualQuestionTypeLabel(question: Pick<ParsedQuestion, 'type' | 'visual'>): string {
  if (isVisualOnlyQuestion(question)) return '图片题'
  if (question.type === 'cloze') return '挖空默写'
  const labels: Record<QuizQuestion['type'], string> = {
    choice: '选择题',
    true_false: '判断题',
    blank: '填空题',
    short: '简答题',
    cloze: '挖空默写',
  }
  return labels[question.type]
}
