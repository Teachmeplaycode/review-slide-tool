export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’"']/g, '')
    .replace(/[，。！？；：、,.!?;:\s()[\]{}（）【】]/g, '')
    .trim()
}

export function splitExpectedAnswer(answer: string): string[] {
  return answer
    .split(/[、,，;；\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function bigrams(value: string): Set<string> {
  const normalized = normalizeAnswer(value)
  const parts = new Set<string>()

  if (normalized.length <= 1) {
    if (normalized) parts.add(normalized)
    return parts
  }

  for (let index = 0; index < normalized.length - 1; index += 1) {
    parts.add(normalized.slice(index, index + 2))
  }

  return parts
}

export function jaccardSimilarity(a: string, b: string): number {
  const left = bigrams(a)
  const right = bigrams(b)
  if (left.size === 0 && right.size === 0) return 1
  if (left.size === 0 || right.size === 0) return 0

  const intersection = Array.from(left).filter((item) => right.has(item)).length
  const union = new Set([...left, ...right]).size
  return intersection / union
}

export function keywordCoverage(expected: string, actual: string): number {
  const normalizedActual = normalizeAnswer(actual)
  const keywords = Array.from(
    new Set(
      Array.from(expected.matchAll(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][\w-]{2,}/g))
        .map((match) => normalizeAnswer(match[0]))
        .filter((item) => item.length >= 2),
    ),
  )

  const recall = bigramRecall(expected, actual)
  if (keywords.length === 0) return recall

  const hits = keywords.filter((keyword) => normalizedActual.includes(keyword)).length
  return Math.max(hits / keywords.length, recall)
}

function bigramRecall(expected: string, actual: string): number {
  const expectedBigrams = bigrams(expected)
  const actualBigrams = bigrams(actual)
  if (expectedBigrams.size === 0) return 0

  const hits = Array.from(expectedBigrams).filter((item) => actualBigrams.has(item)).length
  return hits / expectedBigrams.size
}
