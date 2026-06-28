import type { ClozePayload } from '../../types'

const STOP_WORDS = new Set([
  '因此',
  '主要',
  '可以',
  '进行',
  '包括',
  '软件',
  '系统',
  '阶段',
  '方法',
  '过程',
  '问题',
])

export function generateCloze(answer: string, ratio = 0.3): ClozePayload {
  const clean = answer.replace(/\s+/g, ' ').trim()
  if (!clean) return { text: '', blanks: [] }

  const candidates = collectCandidates(clean)
  const target = Math.max(4, Math.floor(clean.length * ratio))
  const selected: { start: number; end: number; value: string }[] = []
  let covered = 0

  for (const candidate of candidates) {
    if (covered >= target) break
    if (selected.some((item) => intersects(item, candidate))) continue
    selected.push(candidate)
    covered += candidate.value.length
  }

  selected.sort((a, b) => a.start - b.start)

  let cursor = 0
  let text = ''
  const blanks = selected.map((item, index) => {
    text += clean.slice(cursor, item.start)
    text += `[[blank:${index}]]`
    cursor = item.end
    return {
      id: `blank_${index}`,
      answer: item.value,
    }
  })
  text += clean.slice(cursor)

  return { text, blanks }
}

function collectCandidates(text: string): { start: number; end: number; value: string }[] {
  const matches = Array.from(text.matchAll(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][\w-]{2,}/g))
    .map((match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      value: match[0],
    }))
    .filter((item) => !STOP_WORDS.has(item.value) && item.value.length >= 2)

  return seededShuffle(matches).sort((a, b) => b.value.length - a.value.length)
}

function intersects(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function seededShuffle<T>(items: T[]): T[] {
  const copy = [...items]
  let seed = items.length * 97 + 13

  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280
    const swapIndex = seed % (index + 1)
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }

  return copy
}
