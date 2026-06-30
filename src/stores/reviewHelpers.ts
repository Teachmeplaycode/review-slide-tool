import type { OcrBox, OcrPage, QuestionOption, StudySet } from '../types'

export function clampBox(box: OcrBox): OcrBox {
  const x = clamp(box.x)
  const y = clamp(box.y)
  const width = Math.max(0.01, Math.min(box.width, 1 - x))
  const height = Math.max(0.01, Math.min(box.height, 1 - y))

  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
    width: Number(width.toFixed(6)),
    height: Number(height.toFixed(6)),
  }
}

export function mergeOcrPages(existingPages: OcrPage[], incomingPages: OcrPage[]): OcrPage[] {
  const byPage = new Map(existingPages.map((page) => [page.pageNumber, page]))
  incomingPages.forEach((page) => {
    const existing = byPage.get(page.pageNumber)
    if (!existing || page.lines.length >= existing.lines.length) {
      byPage.set(page.pageNumber, page)
    }
  })
  return Array.from(byPage.values()).sort((a, b) => a.pageNumber - b.pageNumber)
}

export function hasAnswer(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0)
  return Boolean(value?.trim())
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function cloneStudySet(studySet: StudySet): StudySet {
  return JSON.parse(JSON.stringify(studySet)) as StudySet
}

export function nextOptionLabel(options: QuestionOption[]): string {
  const used = new Set(options.map((option) => option.label.toUpperCase()))
  const labels = 'ABCDEFGH'.split('')
  return labels.find((label) => !used.has(label)) ?? String(options.length + 1)
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
