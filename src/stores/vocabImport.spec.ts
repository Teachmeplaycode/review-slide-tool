import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importVocabulary } from '../services/api/importApi'
import { useVocabImportStore } from './vocabImport'

vi.mock('../services/api/importApi', () => ({
  importVocabulary: vi.fn(),
}))

describe('vocab import store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(importVocabulary).mockResolvedValue({
      job: {
        id: 'import_1',
        sourceFile: 'words.txt',
        targetBookId: 'book_2',
        mode: 'new_book',
        provider: 'local',
        status: 'success',
        rawTextLength: 24,
        importedCount: 2,
        skippedCount: 0,
        errorMessage: '',
        createdAt: 1,
      },
      book: {
        id: 'book_2',
        name: '导入词库',
        description: '导入',
        language: 'en',
        wordCount: 2,
        learnedCount: 0,
        reviewCount: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      importedCount: 2,
      skippedCount: 0,
      rawTextLength: 24,
      sourceFile: 'words.txt',
      provider: 'local',
      usedAi: false,
      targetMode: 'new_book',
      previewWords: [],
    })
  })

  it('uses the selected file name as the default new book name', () => {
    const store = useVocabImportStore()
    const file = new File(['apple - 苹果'], 'unit-one.txt', { type: 'text/plain' })

    store.setFile(file)

    expect(store.fileName).toBe('unit-one.txt')
    expect(store.bookName).toBe('unit-one')
    expect(store.canImport).toBe(true)
  })

  it('submits import payload and stores the result', async () => {
    const store = useVocabImportStore()
    const file = new File(['apple - 苹果'], 'words.txt', { type: 'text/plain' })

    store.setFile(file)
    const result = await store.runImport('basic_english')

    expect(importVocabulary).toHaveBeenCalledWith({
      file,
      targetMode: 'new_book',
      bookId: 'basic_english',
      bookName: 'words',
      language: '英语',
    })
    expect(result?.importedCount).toBe(2)
    expect(store.result?.book.id).toBe('book_2')
  })
})
