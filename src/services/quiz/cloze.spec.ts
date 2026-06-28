import { describe, expect, it } from 'vitest'
import { generateCloze } from './cloze'

describe('generateCloze', () => {
  it('creates blanks while preserving answer order', () => {
    const result = generateCloze('软件危机是指软件开发和维护过程中效率低、质量难以保障、维护困难。', 0.3)

    expect(result.blanks.length).toBeGreaterThan(0)
    expect(result.text).toContain('[[blank:0]]')

    const rebuilt = result.text.replace(/\[\[blank:(\d+)\]\]/g, (_, index: string) => {
      return result.blanks[Number(index)].answer
    })
    expect(rebuilt).toBe('软件危机是指软件开发和维护过程中效率低、质量难以保障、维护困难。')
  })
})
