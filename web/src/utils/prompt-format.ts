/** Prompt formatters keyed by UNET model name heuristics. */

export type PromptFormatKind = 'anima' | 'none'

export interface FormatPromptResult {
  kind: PromptFormatKind
  prompt: string
  changed: boolean
}

const SCORE_RE = /^score_\d+$/i
const YEAR_RE = /^year[_\s]?\d{4}$/i
const WEIGHT_RE = /^\((.+):([\d.]+)\)$/

export function detectPromptFormat(unetModel: string): PromptFormatKind {
  const name = unetModel.trim().toLowerCase()
  if (name.includes('anima')) return 'anima'
  return 'none'
}

export function formatPromptByUnet(prompt: string, unetModel: string): FormatPromptResult {
  const kind = detectPromptFormat(unetModel)
  if (kind === 'none') {
    return { kind, prompt, changed: false }
  }
  const next = formatAnimaPrompt(prompt)
  return { kind, prompt: next, changed: next !== prompt }
}

/**
 * Anima (circlestone-labs) prompting rules — syntax only, order preserved:
 * - lowercase tags; spaces instead of underscores (except score_*)
 * - space after each comma (Qwen tokenization)
 * - artist tags keep leading @
 * @see https://huggingface.co/circlestone-labs/Anima
 */
export function formatAnimaPrompt(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ', ')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((tag) => formatAnimaTag(tag))
    .filter(Boolean)
    .join(', ')
}

function formatAnimaTag(tag: string): string {
  const weight = tag.match(WEIGHT_RE)
  if (weight) {
    const inner = formatAnimaTagBody(weight[1])
    return `(${inner}:${weight[2]})`
  }
  return formatAnimaTagBody(tag)
}

function formatAnimaTagBody(tag: string): string {
  if (tag.startsWith('@')) {
    const body = tag
      .slice(1)
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return body ? `@${body}` : ''
  }

  if (SCORE_RE.test(tag)) {
    return tag.toLowerCase()
  }

  let text = tag.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  if (looksLikeNaturalLanguage(text)) {
    return text
  }

  if (YEAR_RE.test(text)) {
    return normalizeYearTag(text)
  }

  return text.toLowerCase()
}

function normalizeYearTag(tag: string): string {
  const m = tag.toLowerCase().match(/^year[_\s]?(\d{4})$/)
  if (m) return `year ${m[1]}`
  return tag.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function looksLikeNaturalLanguage(text: string): boolean {
  // Sentence-like chunks keep capitalization (character/series names in NL).
  if (/[.!?]\s|[.!?]$/.test(text)) return true
  return text.split(/\s+/).length >= 12
}
