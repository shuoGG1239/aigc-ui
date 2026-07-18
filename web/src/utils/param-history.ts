import type { Txt2ImgForm } from '@/stores/txt2img'

export interface ParamHistoryEntry {
  fingerprint: string
  at: number
  form: Txt2ImgForm
}

const STORAGE_KEY = 'aigc-ui:txt2img-param-history'
const MAX_ENTRIES = 10

export function loadParamHistory(): ParamHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e): e is ParamHistoryEntry => {
        return (
          !!e &&
          typeof e === 'object' &&
          typeof (e as ParamHistoryEntry).fingerprint === 'string' &&
          typeof (e as ParamHistoryEntry).at === 'number' &&
          !!(e as ParamHistoryEntry).form
        )
      })
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

export function saveParamHistory(entries: ParamHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function formFingerprint(form: Txt2ImgForm): string {
  return JSON.stringify(form)
}

/** Insert or refresh entry (dedupe by fingerprint), newest first, max 10. */
export function pushParamHistory(
  entries: ParamHistoryEntry[],
  form: Txt2ImgForm,
  at = Date.now(),
): ParamHistoryEntry[] {
  const fingerprint = formFingerprint(form)
  const next: ParamHistoryEntry[] = [
    { fingerprint, at, form: { ...form } },
    ...entries.filter((e) => e.fingerprint !== fingerprint),
  ]
  return next.slice(0, MAX_ENTRIES)
}

export function promptSummary(prompt: string, maxLen = 42): string {
  const text = prompt.replace(/\s+/g, ' ').trim()
  if (!text) return '(空 Prompt)'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}

export function formatHms(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
