import type { ModelFamily } from '@/models/family'
import { adaptRandomPrompt } from './adapters'
import {
  applyStrengthPool,
  parseCanonSegments,
  segmentsToCanon,
} from './prompt-canon'
import { joinPrompts, prettyPrompt } from './prompt-tool'
import { randomOne } from './pick'
import { clampCount, type PromptPool, type PromptPoolEntry } from './prompt-pool-types'

/**
 * Sample one prompt from a prompt pool (with replacement).
 * `counts` / `strengths` come from `<pool:name:…>`.
 */
export function nextPoolPrompt(
  pool: PromptPool,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const count = resolveSampleCount(counts)
  const raw = prettyPrompt(joinPrompts(sampleEntries(pool.entries, count, strengths)))
  return adaptRandomPrompt(raw, family)
}

/** Literal prompt for `<random:xxx:…>`. */
export function nextLiteralPrompt(
  prompt: string,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const t = prompt.trim()
  if (!t) return ''
  const count = resolveSampleCount(counts)
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const piece = renderPrompt(t, strengths)
    if (piece) picked.push(piece)
  }
  return adaptRandomPrompt(prettyPrompt(picked.join(',')), family)
}

export function resolveSampleCount(counts: number[] | undefined): number {
  const pool = (counts?.length ? counts : [1]).map((n) => clampCount(n))
  return randomOne(pool) ?? 1
}

export function sampleEntries(
  entries: PromptPoolEntry[],
  count: number,
  strengths?: number[],
): string {
  const active = entries.filter((e) => e.prompt.trim() && e.weight > 0)
  if (!active.length) return ''

  const n = clampCount(count)
  const picked: string[] = []
  for (let i = 0; i < n; i++) {
    const entry = pickEntryByWeight(active)
    if (!entry) continue
    const piece = renderPrompt(entry.prompt, strengths)
    if (piece) picked.push(piece)
  }
  return picked.join(',')
}

function pickEntryByWeight(entries: PromptPoolEntry[]): PromptPoolEntry | undefined {
  let sum = 0
  for (const e of entries) sum += e.weight
  if (sum <= 0) return undefined
  let r = Math.random() * sum
  for (const e of entries) {
    r -= e.weight
    if (r < 0) return e
  }
  return entries[entries.length - 1]
}

function renderPrompt(prompt: string, strengths?: number[]): string {
  const segments = parseCanonSegments(prompt)
  const pool = strengths?.filter((n) => Number.isFinite(n))
  const poolStrength = pool?.length ? (randomOne(pool) ?? null) : null

  if (!segments.length) {
    const t = prompt.trim()
    if (!t) return ''
    if (poolStrength === null) return t
    return segmentsToCanon(applyStrengthPool([{ text: t, strength: null }], poolStrength))
  }

  return segmentsToCanon(applyStrengthPool(segments, poolStrength))
}
