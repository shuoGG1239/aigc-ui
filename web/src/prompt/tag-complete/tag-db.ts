/** Danbooru tags: 2025-09-01 snapshot (Anima-base cutoff ≈ Sep 2025), pt≥20 + aliases. */
import danbooruCsv from './data/danbooru.csv?raw'
import { parseCsv } from './csv'

export interface TagEntry {
  name: string
  nameLower: string
  category: number
  count: number
  aliases: string
  aliasesLower: string
}

export interface TagHit {
  name: string
  category: number
  count: number
  /** Alias that matched, if any. */
  matchedAlias?: string
}

let tags: TagEntry[] | null = null

function parseDanbooruRows(rows: string[][]): TagEntry[] {
  const out: TagEntry[] = []
  for (const row of rows) {
    const name = (row[0] || '').trim()
    if (!name) continue
    const category = Number(row[1]) || 0
    const count = Number(row[2]) || 0
    const aliases = (row[3] || '').trim()
    out.push({
      name,
      nameLower: name.toLowerCase(),
      category,
      count,
      aliases,
      aliasesLower: aliases.toLowerCase(),
    })
  }
  return out
}

/** Sync load from bundled CSV (no fetch / IPC). */
export function ensureTagDb(): TagEntry[] {
  if (!tags) {
    tags = parseDanbooruRows(parseCsv(danbooruCsv))
  }
  return tags
}

/** Normalize user query to booru underscore form for matching. */
export function normalizeTagQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * Search tags by name / alias. Prefers prefix matches, then substring, then alias.
 * Sorted by post count within each tier.
 */
export function searchTags(query: string, limit = 25): TagHit[] {
  const db = ensureTagDb()
  const q = normalizeTagQuery(query)
  if (q.length < 2) return []

  const prefix: TagHit[] = []
  const mid: TagHit[] = []
  const aliasHits: TagHit[] = []

  for (const tag of db) {
    if (tag.nameLower.startsWith(q)) {
      prefix.push({ name: tag.name, category: tag.category, count: tag.count })
      continue
    }
    if (tag.nameLower.includes(q)) {
      mid.push({ name: tag.name, category: tag.category, count: tag.count })
      continue
    }
    if (!tag.aliasesLower || !tag.aliasesLower.includes(q)) continue
    const parts = tag.aliases.split(',')
    const matched = parts.find((a) => a.toLowerCase().includes(q))?.trim() || undefined
    aliasHits.push({
      name: tag.name,
      category: tag.category,
      count: tag.count,
      matchedAlias: matched,
    })
  }

  const byCount = (a: TagHit, b: TagHit) => b.count - a.count
  prefix.sort(byCount)
  mid.sort(byCount)
  aliasHits.sort(byCount)

  return [...prefix, ...mid, ...aliasHits].slice(0, limit)
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** Danbooru category → CSS modifier. */
export function tagCategoryClass(category: number): string {
  switch (category) {
    case 1:
      return 'tac-cat-artist'
    case 3:
      return 'tac-cat-copyright'
    case 4:
      return 'tac-cat-character'
    case 5:
      return 'tac-cat-meta'
    default:
      return 'tac-cat-general'
  }
}
