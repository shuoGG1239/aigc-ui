/** Family-neutral roll tag segments (storage dialect). */

export interface PromptSegment {
  text: string
  /** Fixed strength; null means open to strengths pool / bare emit. */
  strength: number | null
}

function roundStrength(n: number): number {
  return Math.round(n * 100) / 100
}

function formatStrength(n: number): string {
  const r = roundStrength(n)
  return Number.isInteger(r) ? String(r) : String(r)
}

function isWrapped(s: string, open: string, close: string): boolean {
  if (s.length < 2 || s[0] !== open || s[s.length - 1] !== close) return false
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0 && i !== s.length - 1) return false
      if (depth < 0) return false
    }
  }
  return depth === 0
}

/** Split on commas not inside {}, [], or (). */
export function splitTopLevel(raw: string): string[] {
  const parts: string[] = []
  let buf = ''
  let depthCurly = 0
  let depthSquare = 0
  let depthParen = 0
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '{') depthCurly++
    else if (c === '}') depthCurly = Math.max(0, depthCurly - 1)
    else if (c === '[') depthSquare++
    else if (c === ']') depthSquare = Math.max(0, depthSquare - 1)
    else if (c === '(') depthParen++
    else if (c === ')') depthParen = Math.max(0, depthParen - 1)

    if (c === ',' && depthCurly === 0 && depthSquare === 0 && depthParen === 0) {
      const t = buf.trim()
      if (t) parts.push(t)
      buf = ''
      continue
    }
    buf += c
  }
  const t = buf.trim()
  if (t) parts.push(t)
  return parts
}

const WEIGHT_RE = /^\((.+):([\d.]+)\)$/

/** Legacy NAI `artist:name` → canon `@name`. */
export function canonArtistText(text: string): string {
  const t = text.trim()
  const m = t.match(/^artist:\s*(.+)$/i)
  if (!m) return t
  const name = m[1].trim()
  if (!name) return t
  return name.startsWith('@') ? name : `@${name}`
}

function inheritStrength(
  parent: number | null,
  child: number | null,
): number | null {
  if (child !== null) return child
  return parent
}

function boostInnerParts(inner: string, delta: number): string {
  const parts = splitTopLevel(inner)
  if (!parts.length) return ''
  return parts
    .map((p) => {
      const t = p.trim()
      if (!t) return ''
      const m = t.match(WEIGHT_RE)
      if (m && isWrapped(t, '(', ')')) {
        const n = roundStrength(Number(m[2]) + delta)
        if (n === 1) return m[1].trim()
        return `(${m[1].trim()}:${formatStrength(n)})`
      }
      const n = roundStrength(1 + delta)
      if (n === 1) return t
      return `(${t}:${formatStrength(n)})`
    })
    .filter(Boolean)
    .join(', ')
}

/**
 * Preprocess dirty NAI: abutting groups, mid-token braces, mismatched leftovers.
 * Converts innermost {} / [] to (tag:n) before structural parse.
 */
export function preprocessNaiBraces(raw: string): string {
  let s = raw.replace(/[\r\n]+/g, ',').trim()
  if (!s) return ''

  // ((artist:name)) / (artist:name) without numeric weight → @name
  s = s.replace(/\(+artist:\s*([^):]+?)\)+/gi, (_m, name: string) => {
    const n = String(name).trim()
    return n ? (n.startsWith('@') ? n : `@${n}`) : ''
  })

  // Heal legacy corruption: `name_(a), _(b)` → `name_(a)_(b)` (Danbooru qualifiers).
  s = s.replace(/\)\s*,\s*_\(/g, ')_(')

  // Insert commas between abutting groups / group+token.
  // Do not treat `_(…)` as a boundary — that is Danbooru qualifier syntax
  // (e.g. aris_(maid)_(blue_archive)).
  s = s.replace(/([}\])])\s*([{\[(])/g, '$1, $2')
  s = s.replace(/([}\])])\s*([A-Za-z0-9@])/g, '$1, $2')
  s = s.replace(/([A-Za-z0-9@])\s*([{\[])/g, '$1, $2')

  let guard = 0
  while (guard++ < 64) {
    let changed = false
    s = s.replace(/\{([^{}]*)\}/g, (_m, inner: string) => {
      changed = true
      return boostInnerParts(inner, 0.05)
    })
    s = s.replace(/\[([^[\]]*)\]/g, (_m, inner: string) => {
      changed = true
      return boostInnerParts(inner, -0.05)
    })
    if (!changed) break
    // Re-fix abutting after expansions; keep Danbooru `_(qual)` intact.
    s = s.replace(/([A-Za-z0-9@])\(/g, '$1, (')
    s = s.replace(/\)([A-Za-z0-9@])/g, '), $1')
  }

  // Drop unmatched leftover braces
  s = s.replace(/[{}\[\]]/g, '')
  s = s.replace(/,\s*,/g, ', ').replace(/^\s*,|,\s*$/g, '').trim()
  return s
}

function expandPart(part: string, inherited: number | null = null): PromptSegment[] {
  const trimmed = part.trim()
  if (!trimmed) return []

  const weightMatch = trimmed.match(WEIGHT_RE)
  if (weightMatch && isWrapped(trimmed, '(', ')')) {
    const strength = roundStrength(Number(weightMatch[2]))
    if (!Number.isFinite(strength)) {
      return [{ text: trimmed, strength: inherited }]
    }
    const inner = weightMatch[1].trim()
    const innerParts = splitTopLevel(inner)
    if (innerParts.length > 1) {
      return innerParts.flatMap((p) =>
        expandPart(p, null).map((seg) => ({
          text: canonArtistText(seg.text),
          strength: inheritStrength(strength, seg.strength),
        })),
      )
    }
    return [{ text: canonArtistText(inner), strength }]
  }

  let body = trimmed
  let boost = 0
  let weak = 0
  while (body.length >= 2) {
    if (isWrapped(body, '{', '}')) {
      body = body.slice(1, -1).trim()
      boost += 1
      continue
    }
    if (isWrapped(body, '[', ']')) {
      body = body.slice(1, -1).trim()
      weak += 1
      continue
    }
    break
  }

  const fromBrackets =
    boost || weak ? roundStrength(1 + boost * 0.05 - weak * 0.05) : null
  const strength = inheritStrength(inherited, fromBrackets)

  const sub = splitTopLevel(body)
  if (sub.length > 1) {
    return sub.flatMap((p) => expandPart(p, strength))
  }

  if (!body) return []
  return [{ text: canonArtistText(body), strength }]
}

/** Parse NAI / mixed dialect into segments (brace-aware). */
export function parseNaiToSegments(raw: string): PromptSegment[] {
  const cleaned = preprocessNaiBraces(raw)
  if (!cleaned) return []
  return splitTopLevel(cleaned).flatMap((p) => expandPart(p, null))
}

export function segmentsToCanon(segments: PromptSegment[]): string {
  return segments
    .map((seg) => {
      const text = seg.text.trim()
      if (!text) return ''
      if (seg.strength !== null && seg.strength !== 1) {
        return `(${text}:${formatStrength(seg.strength)})`
      }
      return text
    })
    .filter(Boolean)
    .join(', ')
}

/** Normalize any roll tag string into family-neutral canon. */
export function normalizeRollTag(raw: string): string {
  return segmentsToCanon(parseNaiToSegments(raw))
}

/** Parse a canon (or NAI) string into segments for sampling. */
export function parseCanonSegments(tag: string): PromptSegment[] {
  return parseNaiToSegments(tag)
}

export function applyStrengthPool(
  segments: PromptSegment[],
  poolStrength: number | null,
): PromptSegment[] {
  if (poolStrength === null) return segments
  return segments.map((seg) => {
    if (seg.strength !== null) return seg
    return { text: seg.text, strength: poolStrength }
  })
}

export function segmentsToPrompt(segments: PromptSegment[]): string {
  return segmentsToCanon(segments)
}

/** Parse UI strengths field: "0.8, 0.9, 1.0" */
export function parseStrengthsInput(raw: string): number[] {
  if (!raw.trim()) return []
  const out: number[] = []
  for (const part of raw.split(/[,，\s]+/)) {
    if (!part) continue
    const n = Number(part)
    if (!Number.isFinite(n)) continue
    out.push(roundStrength(n))
  }
  return out
}

export function formatStrengthsInput(strengths: number[] | undefined): string {
  if (!strengths?.length) return ''
  return strengths.map(formatStrength).join(', ')
}

export function normalizeStrengths(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const out = raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map(roundStrength)
  return out.length ? out : undefined
}
