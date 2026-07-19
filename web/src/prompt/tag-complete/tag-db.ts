/** Danbooru tags: 2025-09-01 snapshot (Anima-base cutoff ≈ Sep 2025), pt≥20 + aliases. */
import danbooruCsv from './data/danbooru.csv?raw'
/** zh_CN map (`en,zh`): byzod Tags-zh-full-pack first, Physton fills gaps. */
import danbooruZhCsv from './data/danbooru.zh_CN.csv?raw'
import { parseCsvAsync, yieldToMain } from './csv'

export interface TagEntry {
  name: string
  nameLower: string
  category: number
  count: number
  aliases: string
  aliasesLower: string
  translation: string
  translationLower: string
}

export interface TagHit {
  name: string
  category: number
  count: number
  translation?: string
  /** Alias that matched, if any. */
  matchedAlias?: string
}

let tags: TagEntry[] | null = null
let loadPromise: Promise<TagEntry[]> | null = null

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/
const BUILD_YIELD_EVERY = 4000

async function loadTranslationMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const rows = await parseCsvAsync(danbooruZhCsv)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const en = (row[0] || '').trim()
    const zh = (row[1] || '').trim()
    if (en && zh) {
      const key = en.toLowerCase()
      if (!map.has(key)) map.set(key, zh)
    }
    if (i > 0 && i % BUILD_YIELD_EVERY === 0) await yieldToMain()
  }
  return map
}

async function parseDanbooruRows(
  rows: string[][],
  translations: Map<string, string>,
): Promise<TagEntry[]> {
  const out: TagEntry[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = (row[0] || '').trim()
    if (!name) continue
    const category = Number(row[1]) || 0
    const count = Number(row[2]) || 0
    const aliases = (row[3] || '').trim()
    const nameLower = name.toLowerCase()
    const translation = translations.get(nameLower) || ''
    out.push({
      name,
      nameLower,
      category,
      count,
      aliases,
      aliasesLower: aliases.toLowerCase(),
      translation,
      translationLower: translation.toLowerCase(),
    })
    if (i > 0 && i % BUILD_YIELD_EVERY === 0) await yieldToMain()
  }
  return out
}

async function buildTagDb(): Promise<TagEntry[]> {
  const translations = await loadTranslationMap()
  await yieldToMain()
  const rows = await parseCsvAsync(danbooruCsv)
  await yieldToMain()
  return parseDanbooruRows(rows, translations)
}

/** True once the in-memory DB is ready. */
export function isTagDbReady(): boolean {
  return tags != null
}

/**
 * Ensure tag DB is loaded (single-flight). Yields during parse so UI can paint.
 * Safe to call from idle preload / focus / search.
 */
export function ensureTagDb(): Promise<TagEntry[]> {
  if (tags) return Promise.resolve(tags)
  if (!loadPromise) {
    loadPromise = buildTagDb()
      .then((db) => {
        tags = db
        return db
      })
      .catch((err) => {
        loadPromise = null
        throw err
      })
  }
  return loadPromise
}

/** Kick off background load without awaiting (app idle / route enter). */
export function preloadTagDb(): void {
  void ensureTagDb().catch((err) => {
    console.error('[tag-complete] 词库预加载失败', err)
  })
}

/** Normalize Latin/booru query to underscore form. */
export function normalizeTagQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, '_')
}

/** Whether query is long enough to search (CJK: 1 char; Latin: 2). */
export function canSearchTags(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (CJK_RE.test(q)) return q.length >= 1
  return normalizeTagQuery(q).length >= 2
}

/**
 * Search tags by name / alias / zh translation.
 * Returns [] if DB is not ready yet (caller should await ensureTagDb first).
 */
export function searchTags(query: string, limit = 25): TagHit[] {
  const db = tags
  if (!db || !canSearchTags(query)) return []

  const qRaw = query.trim().toLowerCase()
  const qTag = qRaw.replace(/\s+/g, '_')
  const qZh = qRaw
  const preferZh = CJK_RE.test(qRaw)

  const prefix: TagHit[] = []
  const mid: TagHit[] = []
  const aliasHits: TagHit[] = []
  const zhPrefix: TagHit[] = []
  const zhMid: TagHit[] = []

  for (const tag of db) {
    const hit = (extra?: Partial<TagHit>): TagHit => ({
      name: tag.name,
      category: tag.category,
      count: tag.count,
      translation: tag.translation || undefined,
      ...extra,
    })

    if (!preferZh) {
      if (tag.nameLower.startsWith(qTag)) {
        prefix.push(hit())
        continue
      }
      if (tag.nameLower.includes(qTag)) {
        mid.push(hit())
        continue
      }
      if (tag.aliasesLower && tag.aliasesLower.includes(qTag)) {
        const parts = tag.aliases.split(',')
        const matched = parts.find((a) => a.toLowerCase().includes(qTag))?.trim() || undefined
        aliasHits.push(hit({ matchedAlias: matched }))
        continue
      }
    }

    if (tag.translationLower) {
      if (
        tag.translationLower.startsWith(qZh) ||
        tag.translationLower.split(/\s+/).some((p) => p.startsWith(qZh))
      ) {
        zhPrefix.push(hit())
        continue
      }
      if (tag.translationLower.includes(qZh)) {
        zhMid.push(hit())
        continue
      }
    }

    if (preferZh) {
      if (tag.nameLower.startsWith(qTag)) {
        prefix.push(hit())
        continue
      }
      if (tag.nameLower.includes(qTag)) {
        mid.push(hit())
        continue
      }
      if (tag.aliasesLower && tag.aliasesLower.includes(qTag)) {
        const parts = tag.aliases.split(',')
        const matched = parts.find((a) => a.toLowerCase().includes(qTag))?.trim() || undefined
        aliasHits.push(hit({ matchedAlias: matched }))
      }
    }
  }

  const byCount = (a: TagHit, b: TagHit) => b.count - a.count
  prefix.sort(byCount)
  mid.sort(byCount)
  aliasHits.sort(byCount)
  zhPrefix.sort(byCount)
  zhMid.sort(byCount)

  if (preferZh) {
    return [...zhPrefix, ...zhMid, ...prefix, ...mid, ...aliasHits].slice(0, limit)
  }
  return [...prefix, ...mid, ...aliasHits, ...zhPrefix, ...zhMid].slice(0, limit)
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
