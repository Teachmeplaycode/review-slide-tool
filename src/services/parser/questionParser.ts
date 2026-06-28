import type { ParsedQuestion, QuestionOption, QuestionType } from '../../types'

type Block = {
  title: string
  body: string[]
  raw: string
}

const ANSWER_PATTERN = /^\s*(?:答案|参考答案|回答|答)\s*[:：]\s*(.+)\s*$/i
const NUMBERED_PATTERN = /^\s*(?:#{1,6}\s*)?(\d+)[.．、]\s*(.+?)\s*$/
const OPTION_PREFIX_PATTERN = /^\s*([A-Ha-h])\s*[.．、]\s*(.+)\s*$/
const TRUE_FALSE_PATTERN = /^[√×xX对错正确错误TＦFtf]+$/
const BLANK_PATTERN = /_{2,}|（\s*）|\(\s*\)|\s{4,}/
const QUESTION_HINTS = [
  '什么',
  '为什么',
  '哪些',
  '哪几',
  '简述',
  '请',
  '任务',
  '目的',
  '包括',
  '区别',
  '过程模型',
  '内容',
  '方法',
  '原因',
]

export function parseQuestions(input: string): ParsedQuestion[] {
  const text = normalizeSource(input)
  if (!text) return []

  const blocks = splitNumberedBlocks(text)
  const parsed = blocks.length > 0 ? parseBlocks(blocks) : parseUnnumbered(text)

  return parsed.map((question, index) => ({
    ...question,
    id: question.id || createId(index),
  }))
}

function normalizeSource(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

function splitNumberedBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let current: Block | null = null

  for (const line of lines) {
    const numbered = line.match(NUMBERED_PATTERN)
    if (numbered) {
      if (current) blocks.push(current)
      current = {
        title: cleanMarkdown(numbered[2]),
        body: [],
        raw: line,
      }
      continue
    }

    if (current) {
      current.body.push(line)
      current.raw += `\n${line}`
    }
  }

  if (current) blocks.push(current)
  return blocks
}

function parseBlocks(blocks: Block[]): ParsedQuestion[] {
  return blocks.map((block, index) => parseBlock(block, index)).filter(Boolean)
}

function parseBlock(block: Block, index: number): ParsedQuestion {
  const nonEmptyBody = block.body.map((line) => line.trim()).filter(Boolean)
  const answerLineIndex = nonEmptyBody.findIndex((line) => ANSWER_PATTERN.test(line))
  const answerFromMarker = answerLineIndex >= 0 ? nonEmptyBody[answerLineIndex].match(ANSWER_PATTERN)?.[1] ?? '' : ''
  const contentBeforeAnswer = answerLineIndex >= 0 ? nonEmptyBody.slice(0, answerLineIndex) : nonEmptyBody
  const contentAfterTitle = answerLineIndex >= 0 ? contentBeforeAnswer : nonEmptyBody
  const options = parseOptions(contentAfterTitle)
  const bodyWithoutOptions = stripOptionLines(contentAfterTitle)
  const inferredAnswer = answerFromMarker || bodyWithoutOptions.join('\n').trim()
  const type = inferType(block.title, options, inferredAnswer)
  const warnings = createWarnings(type, options, inferredAnswer)

  return {
    id: createId(index),
    type,
    stem: cleanQuestionStem(block.title),
    options,
    answer: cleanAnswer(inferredAnswer),
    raw: block.raw.trim(),
    confidence: confidenceFor(type, options, inferredAnswer, answerLineIndex >= 0),
    warnings,
    enabled: true,
  }
}

function parseUnnumbered(text: string): ParsedQuestion[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const questions: ParsedQuestion[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (BLANK_PATTERN.test(line) && lines[index + 1]) {
      const answer = lines[index + 1]
      questions.push(makeQuestion(questions.length, 'blank', line, [], answer, [line, answer]))
      index += 2
      continue
    }

    if (isLikelyPrompt(line)) {
      const body: string[] = []
      let cursor = index + 1

      while (cursor < lines.length && !isLikelyPrompt(lines[cursor]) && !BLANK_PATTERN.test(lines[cursor])) {
        body.push(lines[cursor])
        cursor += 1
      }

      questions.push(makeQuestion(questions.length, 'short', line, [], body.join('\n'), [line, ...body]))
      index = Math.max(cursor, index + 1)
      continue
    }

    index += 1
  }

  return questions
}

function makeQuestion(
  index: number,
  type: QuestionType,
  stem: string,
  options: QuestionOption[],
  answer: string,
  raw: string[],
): ParsedQuestion {
  const warnings = createWarnings(type, options, answer)

  return {
    id: createId(index),
    type,
    stem: cleanQuestionStem(stem),
    options,
    answer: cleanAnswer(answer),
    raw: raw.join('\n').trim(),
    confidence: confidenceFor(type, options, answer, Boolean(answer)),
    warnings,
    enabled: true,
  }
}

function parseOptions(lines: string[]): QuestionOption[] {
  const optionText = lines.join('\n')
  const compactMatches = Array.from(
    optionText.matchAll(/([A-Ha-h])\s*[.．、]\s*([\s\S]*?)(?=(?:[A-Ha-h]\s*[.．、])|$)/g),
  )

  if (compactMatches.length >= 2) {
    return compactMatches
      .map((match) => ({
        label: match[1].toUpperCase(),
        text: cleanMarkdown(match[2]).trim(),
      }))
      .filter((option) => option.text.length > 0)
  }

  return lines
    .map((line) => line.match(OPTION_PREFIX_PATTERN))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      label: match[1].toUpperCase(),
      text: cleanMarkdown(match[2]).trim(),
    }))
}

function stripOptionLines(lines: string[]): string[] {
  return lines.filter((line) => !OPTION_PREFIX_PATTERN.test(line))
}

function inferType(stem: string, options: QuestionOption[], answer: string): QuestionType {
  const compactAnswer = normalizeAnswerToken(answer)
  if (options.length >= 2) return 'choice'
  if (TRUE_FALSE_PATTERN.test(compactAnswer)) return 'true_false'
  if (BLANK_PATTERN.test(stem)) return 'blank'
  return 'short'
}

function createWarnings(type: QuestionType, options: QuestionOption[], answer: string): string[] {
  const warnings: string[] = []

  if (!answer.trim()) warnings.push('未识别到标准答案')
  if (type === 'choice' && options.length < 2) warnings.push('选择题选项少于 2 个')
  if (type === 'blank' && !BLANK_PATTERN.test(answer) && splitAnswer(answer).length === 0) {
    warnings.push('填空答案可能需要手动拆分')
  }

  return warnings
}

function confidenceFor(
  type: QuestionType,
  options: QuestionOption[],
  answer: string,
  hasAnswerMarker: boolean,
): number {
  let score = 0.52
  if (hasAnswerMarker) score += 0.22
  if (answer.trim()) score += 0.14
  if (type === 'choice' && options.length >= 4) score += 0.12
  if (type === 'true_false') score += 0.1
  if (type === 'blank') score += 0.06
  return Math.min(0.98, Number(score.toFixed(2)))
}

function isLikelyPrompt(line: string): boolean {
  if (line.length > 90) return false
  if (/[？?]/.test(line)) return true
  return QUESTION_HINTS.some((hint) => line.includes(hint)) && /[。:：]?$/.test(line)
}

function cleanQuestionStem(text: string): string {
  return cleanMarkdown(text).replace(/\s+/g, ' ').trim()
}

function cleanAnswer(text: string): string {
  return cleanMarkdown(text)
    .replace(/^答案\s*[:：]\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
}

function normalizeAnswerToken(answer: string): string {
  return answer.replace(/\s+/g, '').replace(/答案[:：]/, '').trim()
}

function splitAnswer(answer: string): string[] {
  return answer.split(/[、,，;；\s]+/).filter(Boolean)
}

function createId(index: number): string {
  return `q_${Date.now().toString(36)}_${index.toString(36)}`
}
