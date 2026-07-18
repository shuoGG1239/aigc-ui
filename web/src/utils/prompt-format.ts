import type { ModelFamily } from '@/models/family'
import { resolveFamily } from '@/models/family'
import { parseNaiToSegments, segmentsToCanon } from '@/prompt/prompt-canon'

export interface FormatPromptResult {
  kind: ModelFamily
  prompt: string
  changed: boolean
}

const SCORE_RE = /^score_\d+$/i
const YEAR_RE = /^year[_\s]?\d{4}$/i
const WEIGHT_RE = /^\((.+):([\d.]+)\)$/

export function detectPromptFormat(opts: {
  family?: string | null
  unetModel?: string | null
  checkpoint?: string | null
}): ModelFamily {
  return resolveFamily(opts)
}

export function formatPromptByFamily(
  prompt: string,
  opts: { family?: string | null; unetModel?: string | null; checkpoint?: string | null },
): FormatPromptResult {
  const kind = detectPromptFormat(opts)
  if (kind === 'anima') {
    const next = formatAnimaPrompt(prompt)
    return { kind, prompt: next, changed: next !== prompt }
  }
  const next = formatSdxlPrompt(prompt)
  return { kind: 'sdxl', prompt: next, changed: next !== prompt }
}

/**
 * Anima: NovelAI braces / artist: → canon weights / @artist, then polish
 * (underscore → space, A1111 `\(` `\)` → plain parens, lowercase tags).
 */
export function formatAnimaPrompt(raw: string): string {
  const canon = segmentsToCanon(parseNaiToSegments(raw))
  return polishAnimaPrompt(canon)
}

/** Tag polish only (assumes already canon / brace-free). */
function polishAnimaPrompt(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ', ')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((tag) => formatAnimaTag(tag))
    .filter(Boolean)
    .join(', ')
}

/**
 * SDXL: NovelAI braces / artist: → weights (bare artist name, no @),
 * then light comma normalize.
 */
export function formatSdxlPrompt(raw: string): string {
  const segments = parseNaiToSegments(raw).map((seg) => {
    let text = seg.text.trim()
    if (text.startsWith('@')) text = text.slice(1).trim()
    return { ...seg, text }
  })
  return segmentsToCanon(segments)
    .replace(/[\r\n]+/g, ', ')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')
}

function formatAnimaTag(tag: string): string {
  // Keep <pool:…> / <random:…> tokens untouched.
  if (/^<[^<>]+>$/.test(tag.trim())) return tag.trim()

  const weight = tag.match(WEIGHT_RE)
  if (weight) {
    const inner = formatAnimaTagBody(weight[1])
    return `(${inner}:${weight[2]})`
  }
  return formatAnimaTagBody(tag)
}

/** A1111 escapes literal parens as `\(` `\)`; Anima wants plain `( )`. */
function unescapeLiteralParens(text: string): string {
  return text.replace(/\\([()])/g, '$1')
}

function polishAnimaText(text: string): string {
  return unescapeLiteralParens(text.replace(/_/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function formatAnimaTagBody(tag: string): string {
  if (tag.startsWith('@')) {
    const body = polishAnimaText(tag.slice(1)).toLowerCase()
    return body ? `@${body}` : ''
  }

  if (SCORE_RE.test(tag)) {
    return tag.toLowerCase()
  }

  let text = polishAnimaText(tag)
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
  if (/[.!?]\s|[.!?]$/.test(text)) return true
  return text.split(/\s+/).length >= 12
}
