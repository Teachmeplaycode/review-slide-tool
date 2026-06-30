import type { OcrBox, OcrPage, ParsedQuestion } from '../../types'
import { visualQuestionStem } from './visualQuestion'

export function createManualVisualQuestion(
  id: string,
  page: OcrPage,
  box: OcrBox,
  ordinal: number,
): ParsedQuestion {
  return {
    id,
    type: 'short',
    stem: visualQuestionStem(page.pageNumber, ordinal),
    options: [],
    answer: '',
    raw: '',
    confidence: 1,
    warnings: [],
    enabled: true,
    ignored: false,
    ocrReviewState: 'confirmed',
    visual: {
      source: 'manual',
      assetId: page.assetId,
      pageNumber: page.pageNumber,
      pageWidth: page.width,
      pageHeight: page.height,
      box,
      lineIds: [],
      confidence: 1,
      engine: 'manual',
    },
  }
}
