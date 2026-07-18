export interface RollEntry {
  /** Tag string as stored in the workflow file. */
  tag: string
  /** Weight for sampling; <= 0 means disabled. */
  weight: number
}

export interface RollWorkflow {
  /** Unique key = filename stem = `<random:name>`. */
  name: string
  entries: RollEntry[]
  updatedAt: number
}

export const WORKFLOW_NAME_RE = /^[a-zA-Z0-9_-]+$/

export function clampCount(n: number): number {
  return Math.max(1, Math.min(32, Math.floor(n) || 1))
}

/** Parse count pool from expression, e.g. `3` or `1,2,3`. */
export function parseCountsInput(raw: string): number[] {
  if (!raw.trim()) return [1]
  const out: number[] = []
  for (const part of raw.split(/[,，\s~～\-]+/)) {
    if (!part) continue
    const n = Number(part)
    if (!Number.isFinite(n)) continue
    out.push(clampCount(n))
  }
  return out.length ? out : [1]
}

/** Parse strength pool from expression, e.g. `0.8,0.9,1`. */
export function parseStrengthsPool(raw: string): number[] {
  if (!raw.trim()) return []
  const out: number[] = []
  for (const part of raw.split(/[,，\s]+/)) {
    if (!part) continue
    const n = Number(part)
    if (!Number.isFinite(n)) continue
    out.push(Math.round(n * 100) / 100)
  }
  return out
}

/** Sanitize to a valid workflow filename / `<random:name>` key. */
export function sanitizeWorkflowName(raw: string, fallback = 'workflow'): string {
  const s = raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[_\-]+|[_\-]+$/g, '')
  return s || fallback
}

export function createEmptyWorkflow(name = 'workflow'): RollWorkflow {
  return {
    name: sanitizeWorkflowName(name),
    entries: [],
    updatedAt: Date.now(),
  }
}
