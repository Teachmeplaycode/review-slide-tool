import type { ImportedOcrAsset, OcrBox, OcrLine, OcrPage, ParsedQuestion, QuestionVisual, StudyAsset } from '../../types'
import { visualQuestionStem } from '../questions/visualQuestion'

type PositionedLine = OcrLine & {
  page: OcrPage
}

export function attachOcrVisuals(questions: ParsedQuestion[], pages: OcrPage[], source: QuestionVisual['source']): ParsedQuestion[] {
  if (!pages.length) return questions

  const lines = pages.flatMap((page) => page.lines.map((line) => ({ ...line, page })))
  let cursor = 0

  return questions.map((question) => {
    const matched = matchLinesForQuestion(question, lines, cursor)
    if (matched.length) {
      const lastIndex = lines.findIndex((line) => line.page.pageNumber === matched[matched.length - 1].page.pageNumber && line.id === matched[matched.length - 1].id)
      cursor = Math.max(cursor, lastIndex + 1)
    }

    const visual = createQuestionVisual(matched, source)
    if (!visual) return question

    return {
      ...question,
      visual,
      confidence: Math.max(question.confidence, visual.confidence),
    }
  })
}

export function questionsFromOcrPages(pages: OcrPage[]): ParsedQuestion[] {
  const questions = pages.flatMap((page) => (page.candidates ?? []).map((candidate, index) => {
    const ignored = candidate.ignored || candidate.reviewState === 'ignored'

    return {
      id: `q_${page.pageNumber}_${candidate.id}`,
      type: 'short',
      stem: visualQuestionStem(page.pageNumber, index + 1),
      options: [],
      answer: '',
      raw: candidate.raw,
      confidence: candidate.confidence,
      warnings: candidate.warnings.filter((warning) => warning !== '未识别到标准答案'),
      enabled: !ignored,
      ignored,
      ocrReviewState: ignored ? 'ignored' : 'confirmed',
      visual: {
        ...candidate.visual,
        engine: candidate.engine,
      },
    } satisfies ParsedQuestion
  }))

  return questions.length ? questions : []
}

export function imagePagesToQuestions(pages: OcrPage[]): ParsedQuestion[] {
  return pages.map((page) => {
    const ignored = page.pageReviewState === 'ignored'

    return {
      id: `q_${page.pageNumber}_image`,
      type: 'short',
      stem: `第 ${page.pageNumber} 页图片题`,
      options: [],
      answer: '',
      raw: '',
      confidence: 1,
      warnings: [],
      enabled: !ignored,
      ignored,
      ocrReviewState: ignored ? 'ignored' : 'confirmed',
      visual: {
        source: 'ocr',
        assetId: page.assetId,
        pageNumber: page.pageNumber,
        pageWidth: page.width,
        pageHeight: page.height,
        box: { x: 0, y: 0, width: 1, height: 1 },
        lineIds: [],
        confidence: 1,
        engine: page.engine ?? 'manual',
      },
    } satisfies ParsedQuestion
  })
}

export function pagesHaveCandidates(pages: OcrPage[]): boolean {
  return pages.some((page) => (page.candidates?.length ?? 0) > 0)
}

export function importedAssetsToStudyAssets(assets: ImportedOcrAsset[], studySetId: string, createdAt = Date.now()): StudyAsset[] {
  return assets.map((asset) => ({
    id: asset.id,
    studySetId,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    blob: dataUrlToBlob(asset.dataUrl),
    createdAt,
  }))
}

export function unionBoxes(boxes: OcrBox[], padding = 0.012): OcrBox {
  if (!boxes.length) return { x: 0, y: 0, width: 1, height: 1 }
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - padding)
  const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - padding)
  const right = Math.min(1, Math.max(...boxes.map((box) => box.x + box.width)) + padding)
  const bottom = Math.min(1, Math.max(...boxes.map((box) => box.y + box.height)) + padding)

  return {
    x: round(left),
    y: round(top),
    width: round(Math.max(0.01, right - left)),
    height: round(Math.max(0.01, bottom - top)),
  }
}

function matchLinesForQuestion(question: ParsedQuestion, lines: PositionedLine[], startIndex: number): PositionedLine[] {
  const target = searchableQuestionText(question)
  if (!target) return lines[startIndex] ? [lines[startIndex]] : []
  const matches: PositionedLine[] = []

  for (let index = startIndex; index < lines.length; index += 1) {
    const lineText = normalize(lines[index].text)
    if (!lineText) continue

    if (target.includes(lineText) || lineText.includes(target.slice(0, Math.min(18, target.length)))) {
      matches.push(lines[index])
      continue
    }

    if (matches.length > 0) break
  }

  if (matches.length) return samePageLines(matches)

  const fallback = lines[startIndex]
  return fallback ? [fallback] : []
}

function searchableQuestionText(question: ParsedQuestion): string {
  return normalize([
    question.stem,
    question.options.map((option) => `${option.label}${option.text}`).join(' '),
  ].filter(Boolean).join(' '))
}

function samePageLines(lines: PositionedLine[]): PositionedLine[] {
  const pageNumber = lines[0]?.page.pageNumber
  return lines.filter((line) => line.page.pageNumber === pageNumber)
}

function createQuestionVisual(lines: PositionedLine[], source: QuestionVisual['source']): QuestionVisual | undefined {
  const page = lines[0]?.page
  if (!page) return undefined

  const confidence = lines.reduce((sum, line) => sum + line.confidence, 0) / Math.max(1, lines.length)

  return {
    source,
    assetId: page.assetId,
    pageNumber: page.pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    box: unionBoxes(lines.map((line) => line.box)),
    lineIds: lines.map((line) => line.id),
    confidence: Number(confidence.toFixed(2)),
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',')
  const mimeType = meta.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream'

  if (meta.includes(';base64')) {
    const bytes = atob(data)
    const buffer = new Uint8Array(bytes.length)
    for (let index = 0; index < bytes.length; index += 1) {
      buffer[index] = bytes.charCodeAt(index)
    }
    return new Blob([buffer], { type: mimeType })
  }

  return new Blob([decodeURIComponent(data ?? '')], { type: mimeType })
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').replace(/[：:。.)）(（、]/g, '').toLowerCase()
}

function round(value: number): number {
  return Number(value.toFixed(6))
}
