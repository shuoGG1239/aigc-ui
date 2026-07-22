import { formatLoraTag } from '@shared/lora-tag'

export type CompleteMode = 'tag' | 'lora' | 'syntax'

export interface CaretToken {
  mode: CompleteMode
  /** Range in full text to replace on accept. */
  start: number
  end: number
  /** Query used for filtering (no `<lora:` prefix; syntax = keyword stem). */
  query: string
}

/** Angle-bracket syntax starters offered while typing `<…`. */
export const SYNTAX_COMPLETIONS = [
  { key: 'lora', label: '<lora:>', insert: '<lora:>', meta: 'LoRA' },
  { key: 'random', label: '<random:>', insert: '<random:>', meta: '随机' },
  { key: 'pool', label: '<pool:>', insert: '<pool:>', meta: '提示词池' },
  { key: 'shuffle', label: '<shuffle:>', insert: '<shuffle:>', meta: '打乱顺序' },
] as const

/**
 * Resolve the token being typed at `caret` for tag / LoRA / syntax autocomplete.
 */
export function getCaretToken(text: string, caret: number): CaretToken | null {
  const pos = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, pos)

  // Inside any unclosed `<…>`
  const lt = before.lastIndexOf('<')
  if (lt >= 0) {
    const frag = before.slice(lt)
    if (!frag.includes('>')) {
      // `<lora:name` → LoRA file completion
      if (/^<lora:/i.test(frag)) {
        return {
          mode: 'lora',
          start: lt,
          end: pos,
          query: frag.replace(/^<lora:/i, ''),
        }
      }
      // `<` / `<lo` / `<pool` (no colon yet) → syntax keywords
      const syn = /^<([a-zA-Z]*)$/.exec(frag)
      if (syn) {
        return { mode: 'syntax', start: lt, end: pos, query: syn[1].toLowerCase() }
      }
      // e.g. <pool: / <random: / <shuffle: — not tag-complete inside
      return null
    }
  }

  let start = 0
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === ',' || ch === '\n' || ch === '\r') {
      start = i + 1
      break
    }
  }
  while (start < pos && /\s/.test(text[start])) start++

  let raw = before.slice(start)
  // Strip incomplete / complete weight wrappers for the search query
  raw = raw.replace(/^[\(\[\{]+/, '')
  const weightIdx = raw.lastIndexOf(':')
  if (weightIdx > 0 && /^[\d.]*$/.test(raw.slice(weightIdx + 1))) {
    raw = raw.slice(0, weightIdx)
  }
  const query = raw.trim()
  if (!query) return null

  return { mode: 'tag', start, end: pos, query }
}

export function formatTagInsert(name: string, family: 'anima' | 'sdxl'): string {
  if (family === 'anima') return name.replace(/_/g, ' ')
  return name
}

export function formatLoraInsert(fileName: string): string {
  return formatLoraTag(fileName, 1)
}

/** Filter `<lora:>` / `<random:>` / `<pool:>` / `<shuffle:>` by typed stem after `<`. */
export function searchSyntaxCompletions(query: string): Array<{
  key: string
  label: string
  insert: string
  meta: string
}> {
  const q = query.trim().toLowerCase()
  return SYNTAX_COMPLETIONS.filter((s) => !q || s.key.startsWith(q)).map((s) => ({
    key: s.key,
    label: s.label,
    insert: s.insert,
    meta: s.meta,
  }))
}
