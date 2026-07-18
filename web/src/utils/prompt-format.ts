import type { ModelFamily } from '@/models/family'
import { resolveFamily } from '@/models/family'

export type PromptFormatKind = ModelFamily | 'none'

export interface FormatPromptResult {
  kind: PromptFormatKind
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
}): PromptFormatKind {
  return resolveFamily(opts)
}

/** @deprecated Prefer formatPromptByFamily */
export function formatPromptByUnet(prompt: string, unetModel: string): FormatPromptResult {
  return formatPromptByFamily(prompt, { unetModel })
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
  if (kind === 'sdxl') {
    const next = formatSdxlPrompt(prompt)
    return { kind, prompt: next, changed: next !== prompt }
  }
  return { kind: 'none', prompt, changed: false }
}

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

/** Light SDXL normalize: comma spacing, drop empty segments. */
export function formatSdxlPrompt(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ', ')
    .split(',')
    .map((p) => p.trim())
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
  if (/[.!?]\s|[.!?]$/.test(text)) return true
  return text.split(/\s+/).length >= 12
}
