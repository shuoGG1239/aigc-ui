export interface PromptPoolEntry {
  /** Prompt fragment as stored in the pool file. */
  prompt: string
  /** Weight for sampling; <= 0 means disabled. */
  weight: number
}

export interface PromptPool {
  /** Unique key = filename stem = `<pool:name>`. */
  name: string
  entries: PromptPoolEntry[]
  updatedAt: number
  /** Embedded built-in pool (no userData override). */
  builtin?: boolean
}

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

/** Sanitize to a valid pool filename / `<pool:name>` key. */
export function sanitizePoolName(raw: string, fallback = 'pool'): string {
  const s = raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[_\-]+|[_\-]+$/g, '')
  return s || fallback
}

export function createEmptyPromptPool(name = 'pool'): PromptPool {
  return {
    name: sanitizePoolName(name),
    entries: [],
    updatedAt: Date.now(),
    builtin: false,
  }
}
