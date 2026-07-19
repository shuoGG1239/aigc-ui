import type { ModelFamily } from '@shared/family'
import { adaptRandomPrompt } from './adapters'
import {
  applyStrengthPool,
  parseCanonSegments,
  segmentsToCanon,
} from './prompt-canon'
import { randomOne } from '@shared/pick'
import {
  isProgramPoolName,
  sampleProgramPool,
  type ProgramPoolContext,
} from '@shared/program-pools'
import {
  clampCount,
  splitPipeList,
  type PromptPool,
  type PromptPoolEntry,
} from '@shared/prompt-pool-types'
import { joinPrompts, prettyPrompt } from '@shared/prompt-tool'

/**
 * Sample one prompt from a prompt pool (with replacement).
 * `counts` / `strengths` come from `<pool:name:…>`.
 * Program pools are opaque: name → string only (may use `ctx` for model-aware pools).
 */
export function nextPoolPrompt(
  pool: PromptPool,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
  ctx?: Omit<ProgramPoolContext, 'family'>,
): string {
  const count = resolveSampleCount(counts)
  if (isProgramPoolName(pool.name)) {
    const programCtx: ProgramPoolContext = {
      family,
      checkpoint: ctx?.checkpoint,
      unetModel: ctx?.unetModel,
    }
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const sampled = sampleProgramPool(pool.name, programCtx)
      if (!sampled) continue
      const piece = renderPrompt(sampled, strengths)
      if (piece) parts.push(piece)
    }
    return adaptRandomPrompt(prettyPrompt(parts.join(',')), family)
  }
  const raw = prettyPrompt(joinPrompts(sampleEntries(pool.entries, count, strengths)))
  return adaptRandomPrompt(raw, family)
}

/**
 * Literal / choice prompt for `<random:xxx:…>`.
 * `prompt` may be `a|b|c` — each sample picks one branch equally.
 */
export function nextLiteralPrompt(
  prompt: string,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const choices = splitPipeList(prompt)
  if (!choices.length) return ''
  const count = resolveSampleCount(counts)
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const t = randomOne(choices) ?? choices[0]
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
