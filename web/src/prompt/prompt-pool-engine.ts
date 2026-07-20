import type { ModelFamily } from '@shared/family'
import { adaptRandomPrompt } from './adapters'
import {
  applyStrengthPool,
  parseCanonSegments,
  segmentsToCanon,
} from './prompt-canon'
import { randomOne, sampleWithoutReplacement, sampleWeightedWithoutReplacement } from '@shared/pick'
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
 * Sample from a prompt pool (without replacement when count > 1).
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
    const parts = sampleProgramPoolUnique(pool.name, programCtx, count, strengths)
    return adaptRandomPrompt(prettyPrompt(parts.join(',')), family)
  }
  const raw = prettyPrompt(joinPrompts(sampleEntries(pool.entries, count, strengths)))
  return adaptRandomPrompt(raw, family)
}

/**
 * Literal / choice prompt for `<random:xxx:…>`.
 * `prompt` may be `a|b|c` (empty branch = omit); count > 1 avoids repeats until exhausted.
 */
export function nextLiteralPrompt(
  prompt: string,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const choices = splitPipeList(prompt)
  // All-empty (e.g. `<|>`) still counts as valid branches.
  if (!choices.length) return ''
  const count = resolveSampleCount(counts)
  const picked: string[] = []
  for (const t of sampleWithoutReplacement(choices, count)) {
    if (!t) continue
    const piece = renderPrompt(t, strengths)
    if (piece) picked.push(piece)
  }
  if (!picked.length) return ''
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
  for (const entry of sampleWeightedWithoutReplacement(active, n, (e) => e.weight)) {
    const piece = renderPrompt(entry.prompt, strengths)
    if (piece) picked.push(piece)
  }
  return picked.join(',')
}

/** Prefer unique program-pool strings; allow repeats only after retries fail. */
function sampleProgramPoolUnique(
  name: string,
  ctx: ProgramPoolContext,
  count: number,
  strengths?: number[],
): string[] {
  const n = clampCount(count)
  const parts: string[] = []
  const seen = new Set<string>()
  const maxUniqueTries = Math.max(n * 12, n + 24)
  for (let tries = 0; parts.length < n && tries < maxUniqueTries; tries++) {
    const sampled = sampleProgramPool(name, ctx)
    if (!sampled) continue
    const piece = renderPrompt(sampled, strengths)
    if (!piece || seen.has(piece)) continue
    seen.add(piece)
    parts.push(piece)
  }
  while (parts.length < n) {
    const sampled = sampleProgramPool(name, ctx)
    if (!sampled) break
    const piece = renderPrompt(sampled, strengths)
    if (piece) parts.push(piece)
  }
  return parts
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
