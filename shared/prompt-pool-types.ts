export interface PromptPoolEntry {
  /** Prompt fragment as stored in the pool file. */
  prompt: string
  /** Relative pick share for sampling; <= 0 means disabled. */
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

/** Angle-tag openers that may nest inside `<pool:>` / `<random:>`. */
const ANGLE_TAG_KIND_RE = /^(pool|random|lora):/i

/** True when `s[index]` starts `<pool:` / `<random:` / `<lora:`. */
export function isAngleTagOpen(s: string, index: number): boolean {
  return s[index] === '<' && ANGLE_TAG_KIND_RE.test(s.slice(index + 1))
}

/**
 * Index of matching `>` for an angle tag at `start`, or -1.
 * Content inside `` `...` `` is opaque (no tag depth / no early close on `>`).
 */
export function findAngleTagClose(s: string, start: number): number {
  if (!isAngleTagOpen(s, start)) return -1
  let depth = 0
  let inQuote = false
  for (let i = start; i < s.length; i++) {
    if (s[i] === '`') {
      inQuote = !inQuote
      continue
    }
    if (inQuote) continue
    if (isAngleTagOpen(s, i)) {
      depth++
      continue
    }
    if (s[i] === '>' && depth > 0) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Split `<random:a|b>` choice branches on `|` (fullwidth `｜` accepted).
 * Empty branches are kept so `<random:tag|>` is ~50% tag / ~50% nothing.
 * Pipes inside nested `<pool:>` / `<random:>` / `<lora:>` or `` `...` `` are ignored.
 */
export function splitPipeList(raw: string): string[] {
  const s = String(raw || '')
  const parts: string[] = []
  let buf = ''
  let depth = 0
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '`') {
      inQuote = !inQuote
      buf += s[i]
      continue
    }
    if (inQuote) {
      buf += s[i]
      continue
    }
    if (isAngleTagOpen(s, i)) {
      depth++
      buf += s[i]
      continue
    }
    if (s[i] === '>' && depth > 0) {
      depth--
      buf += s[i]
      continue
    }
    if (depth === 0 && (s[i] === '|' || s[i] === '｜')) {
      parts.push(buf.trim())
      buf = ''
      continue
    }
    buf += s[i]
  }
  parts.push(buf.trim())
  return parts
}

/**
 * Split on `:` outside nested angle tags and `` `...` `` quotes.
 * Used for `<pool:name:2:0.8>` / `<pool:<random:a|b>:0.8>`.
 */
export function splitColonListDepthAware(raw: string): string[] {
  const s = String(raw || '')
  const parts: string[] = []
  let buf = ''
  let depth = 0
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '`') {
      inQuote = !inQuote
      buf += s[i]
      continue
    }
    if (inQuote) {
      buf += s[i]
      continue
    }
    if (isAngleTagOpen(s, i)) {
      depth++
      buf += s[i]
      continue
    }
    if (s[i] === '>' && depth > 0) {
      depth--
      buf += s[i]
      continue
    }
    if (depth === 0 && s[i] === ':') {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += s[i]
  }
  parts.push(buf)
  return parts
}

/** Split count / strength pools on `|` or `,` (fullwidth accepted). */
export function splitNumericList(raw: string): string[] {
  return String(raw || '')
    .split(/[|｜,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Parse count pool from expression, e.g. `3`, `1|2|3`, or `1,2,3`. */
export function parseCountsInput(raw: string): number[] {
  if (!raw.trim()) return [1]
  const out: number[] = []
  for (const part of splitNumericList(raw)) {
    const n = Number(part)
    if (!Number.isFinite(n)) continue
    out.push(clampCount(n))
  }
  return out.length ? out : [1]
}

/** Parse strength pool from expression, e.g. `0.8|0.9` or `0.8,0.9`. */
export function parseStrengthsPool(raw: string): number[] {
  if (!raw.trim()) return []
  const out: number[] = []
  for (const part of splitNumericList(raw)) {
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
