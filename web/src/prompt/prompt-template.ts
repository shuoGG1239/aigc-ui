import type { ModelFamily } from '@shared/family'
import { nextLiteralPrompt, nextPoolPrompt } from './prompt-pool-engine'
import {
  parseCountsInput,
  parseStrengthsPool,
  splitNumericList,
  type PromptPool,
} from '@shared/prompt-pool-types'

/** Either `<pool:…>` or `<random:…>`. */
export const PROMPT_PLACEHOLDER_RE = /<(?:pool|random):\s*([^<>]+?)\s*>/gi

export interface PlaceholderBody {
  name: string
  /** Optional strength pool from expression. */
  strengths?: number[]
  /** Sample-count pool; default [1]. */
  counts: number[]
}

/** Pure integers → count pool; otherwise strength pool (e.g. 0.8|0.9 or 1.0). */
function isIntegerCountsPool(raw: string): boolean {
  const parts = splitNumericList(raw)
  return parts.length > 0 && parts.every((p) => /^\d+$/.test(p))
}

/** Classify one numeric segment: integers → counts, floats → strengths. */
function classifyNumericSegment(raw: string): {
  counts?: number[]
  strengths?: number[]
} {
  const t = raw.trim()
  if (!t) return {}
  if (isIntegerCountsPool(t)) return { counts: parseCountsInput(t) }
  const strengths = parseStrengthsPool(t)
  return strengths.length ? { strengths } : {}
}

/**
 * Parse inner body after `pool:` / `random:`.
 * Trailing `:…` segments are typed by value: integers = counts, floats = strengths
 * (order does not matter; e.g. `:2,3:0.8,0.9` ≡ `:0.8,0.9:2,3`).
 */
export function parsePlaceholderBody(raw: string): PlaceholderBody {
  const s = String(raw || '').trim()
  const first = s.indexOf(':')
  if (first < 0) {
    return { name: s, counts: [1] }
  }

  const name = s.slice(0, first).trim()
  const rest = s.slice(first + 1).trim()
  if (!rest) return { name, counts: [1] }

  let counts: number[] | undefined
  let strengths: number[] | undefined
  for (const seg of rest.split(':')) {
    const classified = classifyNumericSegment(seg)
    if (classified.counts) counts = classified.counts
    if (classified.strengths) strengths = classified.strengths
  }

  const out: PlaceholderBody = { name, counts: counts ?? [1] }
  if (strengths?.length) out.strengths = strengths
  return out
}

function formatPoolPlaceholder(name: string, counts?: number[], strengths?: number[]): string {
  const n = name.trim()
  const countPart =
    counts?.length && !(counts.length === 1 && counts[0] === 1) ? counts.join('|') : ''
  const strengthPart = strengths?.length ? strengths.join('|') : ''
  if (countPart && strengthPart) return `<pool:${n}:${countPart}:${strengthPart}>`
  if (strengthPart) return `<pool:${n}:${strengthPart}>`
  if (countPart) return `<pool:${n}:${countPart}>`
  return `<pool:${n}>`
}

export function hasPromptPlaceholders(text: string): boolean {
  PROMPT_PLACEHOLDER_RE.lastIndex = 0
  return PROMPT_PLACEHOLDER_RE.test(text)
}

/**
 * Expand `<pool:…>` (prompt pool) and `<random:…>` (literal).
 * Unknown pool names are left as-is and reported in `missing`.
 */
export function expandPromptTemplate(
  template: string,
  family: ModelFamily,
  resolve: (name: string) => PromptPool | null,
  modelCtx?: { checkpoint?: string; unetModel?: string },
): { prompt: string; missing: string[] } {
  const missing: string[] = []

  let prompt = template.replace(/<pool:\s*([^<>]+?)\s*>/gi, (_full, raw: string) => {
    const { name, counts, strengths } = parsePlaceholderBody(raw)
    if (!name) return ''
    const pool = resolve(name)
    if (!pool) {
      if (!missing.includes(name)) missing.push(name)
      return formatPoolPlaceholder(name, counts, strengths)
    }
    return nextPoolPrompt(pool, family, counts, strengths, modelCtx)
  })

  prompt = prompt.replace(/<random:\s*([^<>]+?)\s*>/gi, (_full, raw: string) => {
    const { name, counts, strengths } = parsePlaceholderBody(raw)
    if (!name) return ''
    return nextLiteralPrompt(name, family, counts, strengths)
  })

  return { prompt, missing }
}
