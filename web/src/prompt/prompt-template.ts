import type { ModelFamily } from '@shared/family'
import { sampleWithoutReplacement } from '@shared/pick'
import {
  findAngleTagClose,
  isAngleTagOpen,
  splitColonList,
  splitPipeList,
} from '@shared/prompt-syntax'
import {
  parseCountsInput,
  parseStrengthsPool,
  splitNumericList,
  type PromptPool,
} from '@shared/prompt-pool-types'
import {
  joinLiteralPromptParts,
  nextPoolPrompt,
  resolveSampleCount,
} from './prompt-pool-engine'

const MAX_EXPAND_DEPTH = 16

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
 * Colons inside nested `<pool:>` / `<random:>` / `<lora:>` or `` `...` `` are ignored.
 */
export function parsePlaceholderBody(raw: string): PlaceholderBody {
  const segments = splitColonList(String(raw || '').trim())
  const name = (segments[0] ?? '').trim()
  if (segments.length <= 1) return { name, counts: [1] }

  let counts: number[] | undefined
  let strengths: number[] | undefined
  for (const seg of segments.slice(1)) {
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
  return /<(?:pool|random):/i.test(String(text || ''))
}

interface ExpandContext {
  family: ModelFamily
  resolve: (name: string) => PromptPool | null
  modelCtx?: { checkpoint?: string; unetModel?: string }
  missing: string[]
}

/**
 * Expand `<pool:…>` (prompt pool) and `<random:…>` (literal).
 * Supports nesting, e.g. `<random:<pool:a>|<pool:b>>`,
 * `<pool:<random:name_a|name_b>>`. Outer tag chooses first, then inner expands.
 * `` `...` `` quotes emit interior literally (no tag expand), e.g.
 * `<random:`<pool:a>`|`<pool:b>`>`.
 * Unknown pool names are left as-is and reported in `missing`.
 */
export function expandPromptTemplate(
  template: string,
  family: ModelFamily,
  resolve: (name: string) => PromptPool | null,
  modelCtx?: { checkpoint?: string; unetModel?: string },
): { prompt: string; missing: string[] } {
  const missing: string[] = []
  const prompt = expandAll(String(template || ''), { family, resolve, modelCtx, missing }, 0)
  return { prompt, missing }
}

/** Next `<pool:` / `<random:` at or after `from`; skips `` `...` `` and whole `<lora:…>`. */
function findNextExpandableTag(
  input: string,
  from: number,
): { index: number; kind: string; openLen: number } | null {
  let i = from
  while (i < input.length) {
    let nextAt = -1
    let inQuote = false
    for (let j = i; j < input.length; j++) {
      if (input[j] === '`') {
        inQuote = !inQuote
        continue
      }
      if (inQuote || !isAngleTagOpen(input, j)) continue
      nextAt = j
      break
    }
    if (nextAt < 0) return null

    const rest = input.slice(nextAt + 1)
    const m = /^(pool|random|lora):\s*/i.exec(rest)
    if (!m) {
      i = nextAt + 1
      continue
    }
    const kind = m[1].toLowerCase()
    if (kind === 'lora') {
      const close = findAngleTagClose(input, nextAt)
      i = close >= 0 ? close + 1 : nextAt + 1
      continue
    }
    return { index: nextAt, kind, openLen: 1 + m[0].length }
  }
  return null
}

function expandAll(input: string, ctx: ExpandContext, depth: number): string {
  if (!input || depth > MAX_EXPAND_DEPTH) return input
  if (!hasPromptPlaceholders(input) && !input.includes('`')) return input

  let out = ''
  let i = 0
  while (i < input.length) {
    if (input[i] === '`') {
      const end = input.indexOf('`', i + 1)
      if (end < 0) {
        out += input.slice(i)
        break
      }
      out += input.slice(i + 1, end)
      i = end + 1
      continue
    }

    const open = findNextExpandableTag(input, i)
    if (!open) {
      out += input.slice(i)
      break
    }
    out += input.slice(i, open.index)
    const close = findAngleTagClose(input, open.index)
    if (close < 0) {
      out += input.slice(open.index)
      break
    }
    const body = input.slice(open.index + open.openLen, close)
    out +=
      open.kind === 'pool'
        ? expandPoolBody(body, ctx, depth)
        : expandRandomBody(body, ctx, depth)
    i = close + 1
  }
  return out
}

function expandPoolBody(body: string, ctx: ExpandContext, depth: number): string {
  const { name, counts, strengths } = parsePlaceholderBody(body)
  if (!name) return ''
  const resolvedName = expandAll(name, ctx, depth + 1).trim()
  if (!resolvedName) return ''
  const pool = ctx.resolve(resolvedName)
  if (!pool) {
    if (!ctx.missing.includes(resolvedName)) ctx.missing.push(resolvedName)
    return formatPoolPlaceholder(resolvedName, counts, strengths)
  }
  const sampled = nextPoolPrompt(pool, ctx.family, counts, strengths, ctx.modelCtx)
  return expandAll(sampled, ctx, depth + 1)
}

function expandRandomBody(body: string, ctx: ExpandContext, depth: number): string {
  const { name, counts, strengths } = parsePlaceholderBody(body)
  const branches = splitPipeList(name)
  if (!branches.length) return ''
  const count = resolveSampleCount(counts)
  const picked: string[] = []
  for (const branch of sampleWithoutReplacement(branches, count)) {
    if (!branch) continue
    picked.push(expandAll(branch, ctx, depth + 1))
  }
  return joinLiteralPromptParts(picked, ctx.family, strengths)
}
