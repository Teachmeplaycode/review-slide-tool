import mammoth from 'mammoth'
import type { ImportedText } from '../../types'

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt'])

export async function importStudyFile(file: File): Promise<ImportedText> {
  const extension = getExtension(file.name)

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })

    return {
      title: withoutExtension(file.name),
      sourceFile: file.name,
      text: normalizeText(result.value),
    }
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      title: withoutExtension(file.name),
      sourceFile: file.name,
      text: normalizeText(await readTextFile(file)),
    }
  }

  throw new Error('暂时只支持 docx、md、markdown、txt 文件')
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
