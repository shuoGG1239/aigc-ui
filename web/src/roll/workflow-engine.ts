import type { ModelFamily } from '@/models/family'
import { adaptRolledPrompt } from './adapters'
import {
  applyStrengthPool,
  parseCanonSegments,
  segmentsToPrompt,
} from './prompt-canon'
import { joinPrompts, prettyPrompt } from './prompt-tool'
import { randomOne } from './random'
import type { RollEntry, RollWorkflow } from './workflow-types'

/**
 * Sample one prompt from a flat workflow pool (with replacement).
 * `counts` / `strengths` come from `<random:name:…>`.
 */
export function nextWorkflowPrompt(
  workflow: RollWorkflow,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const count = resolveSampleCount(counts)
  const raw = prettyPrompt(joinPrompts(sampleEntries(workflow.entries, count, strengths)))
  return adaptRolledPrompt(raw, family)
}

/** Literal tag when `<random:xxx>` does not match a workflow name. */
export function nextLiteralPrompt(
  tag: string,
  family: ModelFamily,
  counts: number[] = [1],
  strengths?: number[],
): string {
  const t = tag.trim()
  if (!t) return ''
  const count = resolveSampleCount(counts)
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const piece = renderTag(t, strengths)
    if (piece) picked.push(piece)
  }
  return adaptRolledPrompt(prettyPrompt(joinPrompts(picked.join(','))), family)
}

export function resolveSampleCount(counts: number[] | undefined): number {
  const pool = (counts?.length ? counts : [1]).map((n) => Math.max(1, Math.floor(n) || 1))
  return randomOne(pool) ?? 1
}

export function sampleEntries(
  entries: RollEntry[],
  count: number,
  strengths?: number[],
): string {
  const active = entries.filter((e) => e.tag.trim() && e.weight > 0)
  if (!active.length) return ''

  const n = Math.max(1, Math.floor(count || 1))
  const picked: string[] = []
  for (let i = 0; i < n; i++) {
    const entry = pickEntryByWeight(active)
    if (!entry) continue
    const piece = renderTag(entry.tag, strengths)
    if (piece) picked.push(piece)
  }
  return picked.join(',')
}

function pickEntryByWeight(entries: RollEntry[]): RollEntry | undefined {
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

function renderTag(tag: string, strengths?: number[]): string {
  const segments = parseCanonSegments(tag)
  const pool = strengths?.filter((n) => Number.isFinite(n))
  const poolStrength = pool?.length ? (randomOne(pool) ?? null) : null

  if (!segments.length) {
    const t = tag.trim()
    if (!t) return ''
    if (poolStrength === null) return t
    return segmentsToPrompt(applyStrengthPool([{ text: t, strength: null }], poolStrength))
  }

  return segmentsToPrompt(applyStrengthPool(segments, poolStrength))
}

export function countActiveEntries(workflow: RollWorkflow): number {
  return workflow.entries.filter((e) => e.tag.trim() && e.weight > 0).length
}
