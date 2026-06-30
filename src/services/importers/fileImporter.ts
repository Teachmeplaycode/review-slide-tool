import mammoth from 'mammoth'
import type { ImportedOcr, ImportedText, ImportOptions, OcrLine, OcrPage } from '../../types'

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'])
const OCR_EXTENSIONS = new Set(['pdf', ...IMAGE_EXTENSIONS])
const PPT_EXTENSIONS = new Set(['ppt', 'pptx'])

export async function importStudyFile(file: File, options: ImportOptions = { textOcrEnabled: false }): Promise<ImportedText> {
  const extension = getExtension(file.name)

  if (PPT_EXTENSIONS.has(extension)) {
    throw new Error('PPT/PPTX 第一版暂缓支持，请先导出为 PDF 后再导入。')
  }

  if (OCR_EXTENSIONS.has(extension)) {
    return importOcrFile(file)
  }

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = normalizeText(result.value)

    return {
      title: withoutExtension(file.name),
      sourceFile: file.name,
      text,
      ocr: options.textOcrEnabled ? createSyntheticTextOcr(text) : undefined,
    }
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = normalizeText(await readTextFile(file))

    return {
      title: withoutExtension(file.name),
      sourceFile: file.name,
      text,
      ocr: options.textOcrEnabled ? createSyntheticTextOcr(text) : undefined,
    }
  }

  throw new Error('暂时只支持 docx、md、markdown、txt、pdf 和图片文件')
}

export function isOcrAutoFile(fileName: string): boolean {
  return OCR_EXTENSIONS.has(getExtension(fileName))
}

async function importOcrFile(file: File): Promise<ImportedText> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/ocr/import', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail ?? 'OCR 识别失败，请确认本地后端已启动')
  }

  const payload = await response.json() as ImportedText
  return {
    ...payload,
    title: payload.title || withoutExtension(file.name),
    sourceFile: payload.sourceFile || file.name,
    text: normalizeText(payload.text),
  }
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

function createSyntheticTextOcr(text: string): ImportedOcr | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return undefined

  const pageWidth = 1440
  const pageHeight = 1920
  const marginX = 72
  const marginY = 86
  const lineHeight = 34
  const maxLinesPerPage = Math.floor((pageHeight - marginY * 2) / lineHeight)
  const pages: OcrPage[] = []
  const assets = []

  for (let pageStart = 0; pageStart < lines.length; pageStart += maxLinesPerPage) {
    const pageNumber = pages.length + 1
    const pageLines = lines.slice(pageStart, pageStart + maxLinesPerPage)
    const assetId = `asset_text_${Date.now().toString(36)}_${pageNumber}_${Math.random().toString(36).slice(2, 7)}`
    const ocrLines: OcrLine[] = pageLines.map((line, index) => {
      const y = marginY + index * lineHeight
      const width = Math.min(pageWidth - marginX * 2, Math.max(160, line.length * 22))

      return {
        id: `p${pageNumber}_l${index + 1}`,
        text: line,
        confidence: 1,
        box: {
          x: marginX / pageWidth,
          y: y / pageHeight,
          width: width / pageWidth,
          height: lineHeight / pageHeight,
        },
      }
    })

    pages.push({
      pageNumber,
      assetId,
      width: pageWidth,
      height: pageHeight,
      lines: ocrLines,
    })

    assets.push({
      id: assetId,
      mimeType: 'image/svg+xml',
      width: pageWidth,
      height: pageHeight,
      dataUrl: createTextPageSvgDataUrl(pageLines, pageWidth, pageHeight, marginX, marginY, lineHeight),
    })
  }

  return {
    mode: 'manual_text',
    sourceKind: 'text',
    pages,
    assets,
  }
}

function createTextPageSvgDataUrl(lines: string[], width: number, height: number, marginX: number, marginY: number, lineHeight: number): string {
  const textNodes = lines.map((line, index) => (
    `<text x="${marginX}" y="${marginY + index * lineHeight}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="22" fill="#1f2933">${escapeSvg(line)}</text>`
  )).join('')
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fbfaf7"/>',
    '<rect x="42" y="42" width="1356" height="1836" rx="18" fill="#ffffff" stroke="#e5e0d8"/>',
    textNodes,
    '</svg>',
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
