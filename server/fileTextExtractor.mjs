import path from 'node:path'
import { createRequire } from 'node:module'
import mammoth from 'mammoth'

const require = createRequire(import.meta.url)
const WordExtractor = require('word-extractor')

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown'])
const DOCX_EXTENSIONS = new Set(['.docx'])
const DOC_EXTENSIONS = new Set(['.doc'])

export async function extractTextFromFile(file) {
  if (!file?.buffer?.length) {
    throw createHttpError(400, '请上传有效文件')
  }

  const originalName = file.originalname || 'uploaded.txt'
  const extension = path.extname(originalName).toLowerCase()

  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      sourceFile: originalName,
      extension,
      text: normalizeText(file.buffer.toString('utf8')),
    }
  }

  if (DOCX_EXTENSIONS.has(extension)) {
    const result = await mammoth.extractRawText({ buffer: file.buffer })
    return {
      sourceFile: originalName,
      extension,
      text: normalizeText(result.value),
    }
  }

  if (DOC_EXTENSIONS.has(extension)) {
    const extractor = new WordExtractor()
    const document = await extractor.extract(file.buffer)
    return {
      sourceFile: originalName,
      extension,
      text: normalizeText(document.getBody()),
    }
  }

  throw createHttpError(400, '仅支持 txt、markdown、docx、doc 文件')
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
