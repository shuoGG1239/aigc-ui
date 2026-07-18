import type { ModelFamily } from '@/models/family'
import { nextLiteralPrompt, nextWorkflowPrompt } from './workflow-engine'
import { parseCountsInput, parseStrengthsPool } from './workflow-types'
import type { RollWorkflow } from './workflow-types'

/** `<random:name>` / `<random:name:0.8,0.9>` / `<random:name:3>` / `<random:name:0.8,0.9:2,3>` */
export const PROMPT_RANDOM_RE = /<random:\s*([^<>]+?)\s*>/gi

export interface RandomPlaceholder {
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

/** Parse inner body of `<random:…>`. */
export function parseRandomPlaceholder(raw: string): RandomPlaceholder {
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
    // One suffix: integers → counts; else → strengths
    if (isIntegerCountsPool(rest)) {
      return { name, counts: parseCountsInput(rest) }
    }
    const strengths = parseStrengthsPool(rest)
    return strengths.length ? { name, strengths, counts: [1] } : { name, counts: [1] }
  }

  // Two suffixes: strengths : counts  (e.g. 0.8,0.9:2,3)
  const strengthRaw = rest.slice(0, second).trim()
  const countRaw = rest.slice(second + 1).trim()
  const strengths = parseStrengthsPool(strengthRaw)
  const out: RandomPlaceholder = {
    name,
    counts: countRaw ? parseCountsInput(countRaw) : [1],
  }
  if (strengths.length) out.strengths = strengths
  return out
}

export function formatRandomPlaceholder(
  name: string,
  counts?: number[],
  strengths?: number[],
): string {
  const n = name.trim()
  const countPart =
    counts?.length && !(counts.length === 1 && counts[0] === 1) ? counts.join(',') : ''
  const strengthPart = strengths?.length ? strengths.join(',') : ''
  if (strengthPart && countPart) return `<random:${n}:${strengthPart}:${countPart}>`
  if (strengthPart) return `<random:${n}:${strengthPart}>`
  if (countPart) return `<random:${n}:${countPart}>`
  return `<random:${n}>`
}

export function hasPromptPlaceholders(text: string): boolean {
  PROMPT_RANDOM_RE.lastIndex = 0
  return PROMPT_RANDOM_RE.test(text)
}

/** Unique keys referenced by `<random:…>` (workflow name or literal tag). */
export function listPromptPlaceholders(text: string): string[] {
  const names: string[] = []
  const re = /<random:\s*([^<>]+?)\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const { name } = parseRandomPlaceholder(m[1])
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Replace each `<random:…>`.
 * Known workflow → sample pool; otherwise treat `name` as a literal tag.
 */
export function expandPromptTemplate(
  template: string,
  family: ModelFamily,
  resolve: (name: string) => RollWorkflow | null,
): { prompt: string; missing: string[] } {
  const missing: string[] = []
  const prompt = template.replace(/<random:\s*([^<>]+?)\s*>/gi, (_full, raw: string) => {
    const { name, counts, strengths } = parseRandomPlaceholder(raw)
    if (!name) return ''
    const wf = resolve(name)
    if (wf) return nextWorkflowPrompt(wf, family, counts, strengths)
    return nextLiteralPrompt(name, family, counts, strengths)
  })
  return { prompt, missing }
}
