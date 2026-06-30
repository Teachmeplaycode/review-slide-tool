import type { ImportTargetMode, VocabImportResult } from '../../types'

export type ImportVocabularyPayload = {
  file: File
  targetMode: ImportTargetMode
  bookId: string
  bookName: string
}

export async function importVocabulary(payload: ImportVocabularyPayload): Promise<VocabImportResult> {
  const form = new FormData()
  form.append('file', payload.file)
  form.append('targetMode', payload.targetMode)
  form.append('bookId', payload.bookId)
  form.append('bookName', payload.bookName)

  const response = await fetch('/api/import/vocab', {
    method: 'POST',
    body: form,
  })
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error ?? '导入失败')
  }

  return body as VocabImportResult
}
