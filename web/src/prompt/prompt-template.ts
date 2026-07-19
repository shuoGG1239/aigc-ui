import type { ModelFamily } from '@/models/family'
import { nextLiteralPrompt, nextPoolPrompt } from './prompt-pool-engine'
import { parseCountsInput, parseStrengthsPool } from './prompt-pool-types'
import type { PromptPool } from './prompt-pool-types'

/** Either `<pool:…>` or `<random:…>`. */
export const PROMPT_PLACEHOLDER_RE = /<(?:pool|random):\s*([^<>]+?)\s*>/gi

export interface PlaceholderBody {
  name: string
  /** Optional strength pool from expression. */
  strengths?: number[]
  /** Sample-count pool; default [1]. */
  counts: number[]
}

/** Pure integers → count pool; otherwise strength pool (e.g. 0.8,0.9 or 1.0). */
function isIntegerCountsPool(raw: string): boolean {
  const parts = raw.split(/[,，\s~～\-]+/).filter(Boolean)
  return parts.length > 0 && parts.every((p) => /^\d+$/.test(p.trim()))
}

/** Parse inner body after `pool:` / `random:`. */
export function parsePlaceholderBody(raw: string): PlaceholderBody {
  const s = String(raw || '').trim()
  const first = s.indexOf(':')
  if (first < 0) {
    return { name: s, counts: [1] }
  }

  const name = s.slice(0, first).trim()
  const rest = s.slice(first + 1).trim()
  if (!rest) return { name, counts: [1] }

  const second = rest.indexOf(':')
  if (second < 0) {
    if (isIntegerCountsPool(rest)) {
      return { name, counts: parseCountsInput(rest) }
    }
    const strengths = parseStrengthsPool(rest)
    return strengths.length ? { name, strengths, counts: [1] } : { name, counts: [1] }
  }

  const strengthRaw = rest.slice(0, second).trim()
  const countRaw = rest.slice(second + 1).trim()
  const strengths = parseStrengthsPool(strengthRaw)
  const out: PlaceholderBody = {
    name,
    counts: countRaw ? parseCountsInput(countRaw) : [1],
  }
  if (strengths.length) out.strengths = strengths
  return out
}

function formatPoolPlaceholder(name: string, counts?: number[], strengths?: number[]): string {
  const n = name.trim()
  const countPart =
    counts?.length && !(counts.length === 1 && counts[0] === 1) ? counts.join(',') : ''
  const strengthPart = strengths?.length ? strengths.join(',') : ''
  if (strengthPart && countPart) return `<pool:${n}:${strengthPart}:${countPart}>`
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
