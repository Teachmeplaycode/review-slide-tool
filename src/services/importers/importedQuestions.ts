import type { ImportedText, OcrPage, ParsedQuestion } from '../../types'
import { parseQuestions } from '../parser/questionParser'
import { normalizeVisualOnlyQuestions } from '../questions/visualQuestion'
import {
  attachOcrVisuals,
  imagePagesToQuestions,
  questionsFromOcrPages,
} from './ocrVisuals'

export function buildQuestionsFromImport(imported: ImportedText): ParsedQuestion[] {
  if (!imported.ocr) return parseQuestions(imported.text)
  if (imported.ocr.sourceKind === 'image') return imagePagesToQuestions(imported.ocr.pages)
  return buildQuestionsFromOcrPages(
    imported.ocr.pages,
    imported.ocr.sourceKind === 'text' ? 'synthetic_text' : 'ocr',
    imported.text,
  )
}

export function buildQuestionsFromOcrPages(
  pages: OcrPage[],
  source: 'ocr' | 'synthetic_text',
  fallbackText = '',
): ParsedQuestion[] {
  const fromCandidates = questionsFromOcrPages(pages)
  if (fromCandidates.length) return fromCandidates

  const parsed = parseQuestions(fallbackText || textFromOcrPages(pages))
  const questions = attachOcrVisuals(parsed, pages, source)
  return source === 'ocr' ? normalizeVisualOnlyQuestions(questions) : questions
}

function textFromOcrPages(pages: OcrPage[]): string {
  return pages
    .map((page) => page.lines
      .filter((line) => line.text.trim() && line.confidence >= 0.35)
      .map((line) => line.text)
      .join('\n'))
    .filter(Boolean)
    .join('\n\n')
}
