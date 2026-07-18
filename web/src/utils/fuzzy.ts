/** Case-insensitive substring match with highlight parts. */

export interface FuzzyPart {
  text: string
  hit: boolean
}

export interface FuzzyHit {
  parts: FuzzyPart[]
}

/** Empty query matches everything (no highlight). */
export function fuzzyMatch(text: string, query: string): FuzzyHit | null {
  const q = query.trim()
  if (!q) return { parts: [{ text, hit: false }] }

  const sub = text.toLowerCase().indexOf(q.toLowerCase())
  if (sub < 0) return null

  const parts: FuzzyPart[] = []
  if (sub > 0) parts.push({ text: text.slice(0, sub), hit: false })
  parts.push({ text: text.slice(sub, sub + q.length), hit: true })
  if (sub + q.length < text.length) {
    parts.push({ text: text.slice(sub + q.length), hit: false })
  }
  return { parts }
}

export function fuzzyParts(text: string, query: string): FuzzyPart[] {
  return fuzzyMatch(text, query)?.parts ?? [{ text, hit: false }]
}

export function fuzzyMatches(text: string, query: string): boolean {
  return fuzzyMatch(text, query) != null
}
