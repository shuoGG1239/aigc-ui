/**
 * Shared scanners for `<pool:>` / `<random:>` / `<shuffle:>` / `<lora:>` and `` `...` `` quotes.
 * Used by template expand and pool literal splits.
 */

const ANGLE_TAG_KIND_RE = /^(pool|random|shuffle|lora):/i

export interface AngleScanState {
  depth: number
  inQuote: boolean
}

export type AngleScanKind = 'toggle-quote' | 'in-quote' | 'tag-open' | 'tag-close' | 'plain'

/** True when `s[index]` starts `<pool:` / `<random:` / `<shuffle:` / `<lora:`. */
export function isAngleTagOpen(s: string, index: number): boolean {
  return s[index] === '<' && ANGLE_TAG_KIND_RE.test(s.slice(index + 1))
}

/**
 * Advance quote / angle-tag depth for `s[i]`.
 * Tag depth only changes outside `` `...` ``.
 */
export function advanceAngleScan(s: string, i: number, state: AngleScanState): AngleScanKind {
  if (s[i] === '`') {
    state.inQuote = !state.inQuote
    return 'toggle-quote'
  }
  if (state.inQuote) return 'in-quote'
  if (isAngleTagOpen(s, i)) {
    state.depth++
    return 'tag-open'
  }
  if (s[i] === '>' && state.depth > 0) {
    state.depth--
    return 'tag-close'
  }
  return 'plain'
}

/**
 * Index of matching `>` for an angle tag at `start`, or -1.
 * Content inside `` `...` `` is opaque (no tag depth / no early close on `>`).
 */
export function findAngleTagClose(s: string, start: number): number {
  if (!isAngleTagOpen(s, start)) return -1
  const state: AngleScanState = { depth: 0, inQuote: false }
  for (let i = start; i < s.length; i++) {
    const kind = advanceAngleScan(s, i, state)
    if (kind === 'tag-close' && state.depth === 0) return i
  }
  return -1
}

function splitOutsideTags(
  raw: string,
  isSep: (ch: string) => boolean,
  trimParts: boolean,
): string[] {
  const s = String(raw || '')
  const parts: string[] = []
  let buf = ''
  const state: AngleScanState = { depth: 0, inQuote: false }
  for (let i = 0; i < s.length; i++) {
    const kind = advanceAngleScan(s, i, state)
    if (kind === 'plain' && state.depth === 0 && isSep(s[i])) {
      parts.push(trimParts ? buf.trim() : buf)
      buf = ''
      continue
    }
    buf += s[i]
  }
  parts.push(trimParts ? buf.trim() : buf)
  return parts
}

/**
 * Split `<random:a|b>` choice branches on `|` (fullwidth `｜` accepted).
 * Empty branches are kept so `<random:tag|>` is ~50% tag / ~50% nothing.
 * Pipes inside nested angle tags or `` `...` `` are ignored.
 */
export function splitPipeList(raw: string): string[] {
  return splitOutsideTags(raw, (ch) => ch === '|' || ch === '｜', true)
}

/**
 * Split on `:` outside nested angle tags and `` `...` `` quotes.
 * Used for `<pool:name:2:0.8>` / `<pool:<random:a|b>:0.8>`.
 */
export function splitColonList(raw: string): string[] {
  return splitOutsideTags(raw, (ch) => ch === ':', false)
}

/**
 * Split `<shuffle:a, b, c>` segments on `,` (fullwidth `，` accepted).
 * Commas inside nested angle tags or `` `...` `` are ignored.
 * Empty segments are kept so trailing commas still yield a slot.
 */
export function splitCommaList(raw: string): string[] {
  return splitOutsideTags(raw, (ch) => ch === ',' || ch === '，', true)
}
