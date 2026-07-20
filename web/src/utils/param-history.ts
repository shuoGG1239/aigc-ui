import { isModelFamily, type ModelFamily } from '@shared/family'
import { clampParamHistoryMax, PARAM_HISTORY_MAX_DEFAULT } from '@shared/limits'
import type { Txt2ImgForm } from '@shared/txt2img-form'
import { sha256Hex } from '@/utils/sha256'

export interface ParamHistoryEntry {
  fingerprint: string
  at: number
  form: Txt2ImgForm
  /** User pin — survives unstarred eviction. */
  starred?: boolean
  /** When starred; used to order favorites. */
  starredAt?: number
}

const STORAGE_KEY = 'aigc-ui:txt2img-param-history'

function normalizeFamily(value: unknown): ModelFamily {
  return isModelFamily(value) ? value : 'anima'
}

function normalizeEntry(raw: ParamHistoryEntry): ParamHistoryEntry {
  const form = raw.form as Txt2ImgForm
  const entry: ParamHistoryEntry = {
    fingerprint: raw.fingerprint,
    at: raw.at,
    form: {
      ...form,
      family: normalizeFamily(form.family),
      checkpoint: typeof form.checkpoint === 'string' ? form.checkpoint : '',
    },
  }
  if (raw.starred === true) {
    entry.starred = true
    entry.starredAt = typeof raw.starredAt === 'number' ? raw.starredAt : raw.at
  }
  return entry
}

function resolveMax(maxUnstarred?: number): number {
  return clampParamHistoryMax(maxUnstarred, PARAM_HISTORY_MAX_DEFAULT)
}

/** Starred first (by starredAt), then recent unstarred (by at). */
export function sortParamHistory(entries: ParamHistoryEntry[]): ParamHistoryEntry[] {
  const starred = entries
    .filter((e) => e.starred)
    .sort((a, b) => (b.starredAt ?? b.at) - (a.starredAt ?? a.at))
  const rest = entries.filter((e) => !e.starred).sort((a, b) => b.at - a.at)
  return [...starred, ...rest]
}

/** Keep all starred; keep at most `maxUnstarred` non-starred (newest by `at`). */
export function trimParamHistory(
  entries: ParamHistoryEntry[],
  maxUnstarred: number = PARAM_HISTORY_MAX_DEFAULT,
): ParamHistoryEntry[] {
  const max = resolveMax(maxUnstarred)
  const starred = entries.filter((e) => e.starred)
  const unstarred = entries
    .filter((e) => !e.starred)
    .sort((a, b) => b.at - a.at)
    .slice(0, max)
  return sortParamHistory([...starred, ...unstarred])
}

export function loadParamHistory(
  maxUnstarred: number = PARAM_HISTORY_MAX_DEFAULT,
): ParamHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const entries = parsed
      .filter((e): e is ParamHistoryEntry => {
        return (
          !!e &&
          typeof e === 'object' &&
          typeof (e as ParamHistoryEntry).fingerprint === 'string' &&
          typeof (e as ParamHistoryEntry).at === 'number' &&
          !!(e as ParamHistoryEntry).form
        )
      })
      .map(normalizeEntry)
    return trimParamHistory(entries, maxUnstarred)
  } catch {
    return []
  }
}

export function saveParamHistory(
  entries: ParamHistoryEntry[],
  maxUnstarred: number = PARAM_HISTORY_MAX_DEFAULT,
): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimParamHistory(entries, maxUnstarred)))
}

/** SHA-256 hex of canonical form JSON; `batchSize` excluded from identity. */
export function formFingerprint(form: Txt2ImgForm): string {
  const { batchSize: _batchSize, ...rest } = form
  return sha256Hex(JSON.stringify(rest))
}

/** Insert or refresh entry (dedupe by fingerprint), preserve star, newest first among peers. */
export function pushParamHistory(
  entries: ParamHistoryEntry[],
  form: Txt2ImgForm,
  at = Date.now(),
  maxUnstarred: number = PARAM_HISTORY_MAX_DEFAULT,
): ParamHistoryEntry[] {
  const fingerprint = formFingerprint(form)
  const prev = entries.find((e) => e.fingerprint === fingerprint)
  const entry: ParamHistoryEntry = {
    fingerprint,
    at,
    form: { ...form },
  }
  if (prev?.starred) {
    entry.starred = true
    entry.starredAt = prev.starredAt ?? prev.at
  }
  return trimParamHistory(
    [entry, ...entries.filter((e) => e.fingerprint !== fingerprint)],
    maxUnstarred,
  )
}

/** Toggle star on an entry; no-op if fingerprint missing. */
export function toggleStarParamHistory(
  entries: ParamHistoryEntry[],
  fingerprint: string,
  at = Date.now(),
  maxUnstarred: number = PARAM_HISTORY_MAX_DEFAULT,
): ParamHistoryEntry[] {
  let changed = false
  const next = entries.map((e) => {
    if (e.fingerprint !== fingerprint) return e
    changed = true
    if (e.starred) {
      return { fingerprint: e.fingerprint, at: e.at, form: e.form }
    }
    return { ...e, starred: true as const, starredAt: at }
  })
  return changed ? trimParamHistory(next, maxUnstarred) : entries
}

export function promptSummary(prompt: string, maxLen = 56): string {
  const text = prompt.replace(/\s+/g, ' ').trim()
  if (!text) return '(空 Prompt)'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}

/** e.g. `08/09 19:13:33` */
export function formatHms(ts: number): string {
  const d = new Date(ts)
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${mo}/${day} ${hh}:${mm}:${ss}`
}
