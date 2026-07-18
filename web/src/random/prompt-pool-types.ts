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
  /** Embedded built-in JSON pool (no rename/delete; edit → user override). */
  builtin?: boolean
}

/** Builtin JSON — locked rename/delete in UI. */
export function isLockedPool(pool: PromptPool): boolean {
  return pool.builtin === true
}

export const POOL_NAME_RE = /^[a-zA-Z0-9_-]+$/

export function isValidPoolName(name: string): boolean {
  return POOL_NAME_RE.test(name)
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
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[_\-]+|[_\-]+$/g, '')
  return s || fallback
}

export function normalizePoolEntries(raw: unknown): PromptPoolEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e): PromptPoolEntry => {
    const row = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    return {
      prompt: typeof row.prompt === 'string' ? row.prompt : '',
      weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : 1,
    }
  })
}

/** Normalize pool JSON / IPC payload into a PromptPool. */
export function normalizePromptPool(
  raw: Partial<PromptPool> & { name?: string; entries?: unknown },
  opts?: { fileName?: string; builtin?: boolean; defaultUpdatedAt?: number },
): PromptPool {
  const stem = opts?.fileName?.replace(/\.json$/i, '') || 'pool'
  const fallback = sanitizePoolName(stem, 'pool')
  const name = sanitizePoolName(
    typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback,
    fallback,
  )
  return {
    name: isValidPoolName(name) ? name : fallback,
    entries: normalizePoolEntries(raw.entries),
    updatedAt:
      typeof raw.updatedAt === 'number'
        ? raw.updatedAt
        : (opts?.defaultUpdatedAt ?? Date.now()),
    builtin: opts?.builtin ?? raw.builtin === true,
  }
}

export function createEmptyPromptPool(name = 'pool'): PromptPool {
  return {
    name: sanitizePoolName(name),
    entries: [],
    updatedAt: Date.now(),
    builtin: false,
  }
}

/** Allocate `base`, or `base_2`, `base_3`, … against existing names. */
export function allocUniquePoolName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  let name = sanitizePoolName(base)
  if (!taken.has(name.toLowerCase())) return name
  let i = 2
  while (taken.has(`${name}_${i}`.toLowerCase())) i++
  return `${name}_${i}`
}
