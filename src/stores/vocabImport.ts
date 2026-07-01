import { defineStore } from 'pinia'
import type { ImportTargetMode, VocabImportResult } from '../types'
import { importVocabulary } from '../services/api/importApi'

type VocabImportState = {
  targetMode: ImportTargetMode
  bookName: string
  language: string
  file: File | null
  importing: boolean
  result: VocabImportResult | null
  error: string
}

export const useVocabImportStore = defineStore('vocabImport', {
  state: (): VocabImportState => ({
    targetMode: 'new_book',
    bookName: '',
    language: '英语',
    file: null,
    importing: false,
    result: null,
    error: '',
  }),

  getters: {
    canImport(state): boolean {
      return Boolean(state.file) && !state.importing
    },
    fileName(state): string {
      return state.file?.name ?? ''
    },
  },

  actions: {
    setFile(file: File | null) {
      this.file = file
      this.result = null
      this.error = ''

      if (file && !this.bookName.trim()) {
        this.bookName = file.name.replace(/\.[^.]+$/, '')
      }
    },

    resetResult() {
      this.result = null
      this.error = ''
    },

    async runImport(currentBookId: string, currentLanguage = '英语'): Promise<VocabImportResult | null> {
      if (!this.file) return null

      this.importing = true
      this.error = ''
      this.result = null

      try {
        this.result = await importVocabulary({
          file: this.file,
          targetMode: this.targetMode,
          bookId: currentBookId,
          bookName: this.bookName,
          language: this.targetMode === 'merge_current' ? currentLanguage : this.language,
        })
        return this.result
      } catch (error) {
        this.error = errorMessage(error)
        return null
      } finally {
        this.importing = false
      }
    },
  },
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '导入失败'
}
