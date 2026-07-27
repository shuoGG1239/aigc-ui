import { formatLoraTag } from '@shared/lora-tag'

export type CompleteMode = 'tag' | 'lora' | 'syntax' | 'pool'

export interface CaretToken {
  mode: CompleteMode
  /** Range in full text to replace on accept. */
  start: number
  end: number
  /** Query used for filtering (no `<lora:` / `<pool:` / leading `@` prefix; syntax = keyword stem). */
  query: string
  /** User typed `@…` (Anima artist); insert should keep `@` for anima. */
  atPrefix?: boolean
}

/** Angle-bracket syntax starters offered while typing `<…`. */
export const SYNTAX_COMPLETIONS = [
  { key: 'lora', label: '<lora:>', insert: '<lora:>', meta: 'LoRA' },
  { key: 'random', label: '<random:>', insert: '<random:>', meta: '随机' },
  { key: 'pool', label: '<pool:>', insert: '<pool:>', meta: '提示词池' },
  { key: 'shuffle', label: '<shuffle:>', insert: '<shuffle:>', meta: '打乱顺序' },
] as const

/** Separators between tag tokens in normal prompt text. */
function isPromptTagSep(ch: string): boolean {
  return ch === ',' || ch === '\n' || ch === '\r'
}

/** Separators between choice segments inside `<random:>` / `<shuffle:>`. */
function isChoiceTagSep(ch: string): boolean {
  return ch === ',' || ch === '，' || ch === '|' || ch === '｜' || ch === '\n' || ch === '\r'
}

/**
 * Tag token immediately before `pos`, scanning back to `minStart` with `isSep`.
 */
function tagTokenAt(
  text: string,
  pos: number,
  minStart: number,
  isSep: (ch: string) => boolean,
): CaretToken | null {
  let start = minStart
  for (let i = pos - 1; i >= minStart; i--) {
    if (isSep(text[i]!)) {
      start = i + 1
      break
    }
  }
  while (start < pos && /\s/.test(text[start]!)) start++

  let raw = text.slice(start, pos)
  // Strip incomplete / complete weight wrappers for the search query
  raw = raw.replace(/^[\(\[\{]+/, '')
  const weightIdx = raw.lastIndexOf(':')
  if (weightIdx > 0 && /^[\d.]*$/.test(raw.slice(weightIdx + 1))) {
    raw = raw.slice(0, weightIdx)
  }
  // Anima `@artist` — search without `@` (tag DB has bare names)
  const atPrefix = raw.startsWith('@')
  if (atPrefix) raw = raw.slice(1)
  const query = raw.trim()
  if (!query) return null
  return { mode: 'tag', start, end: pos, query, ...(atPrefix ? { atPrefix: true } : {}) }
}

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
      // `<pool:name` → prompt-pool name completion (before counts / nested `<`)
      if (/^<pool:/i.test(frag)) {
        const body = frag.replace(/^<pool:/i, '')
        if (/^[a-zA-Z0-9_-]*$/.test(body)) {
          return { mode: 'pool', start: lt, end: pos, query: body }
        }
        return null
      }
      // `<random:…` / `<shuffle:…` → tag complete current choice segment
      const choice = /^<(random|shuffle):\s*/i.exec(frag)
      if (choice) {
        return tagTokenAt(text, pos, lt + choice[0].length, isChoiceTagSep)
      }
      return null
    }
  }

  return tagTokenAt(text, pos, 0, isPromptTagSep)
}

export function formatTagInsert(
  name: string,
  family: 'anima' | 'sdxl',
  opts?: { atPrefix?: boolean },
): string {
  let out = family === 'anima' ? name.replace(/_/g, ' ') : name
  // Keep `@` only for Anima (SDXL artists are bare names).
  if (opts?.atPrefix && family === 'anima') out = `@${out}`
  return out
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

/** Filter current prompt-pool names for `<pool:…>` autocomplete. */
export function searchPoolCompletions(
  names: string[],
  query: string,
  limit = 25,
): Array<{
  key: string
  label: string
  insert: string
  meta: string
}> {
  const q = query.trim().toLowerCase()
  const hits = names.filter((n) => !q || n.toLowerCase().includes(q))
  hits.sort((a, b) => {
    if (!q) return a.localeCompare(b)
    const al = a.toLowerCase()
    const bl = b.toLowerCase()
    const ap = al.startsWith(q) ? 0 : 1
    const bp = bl.startsWith(q) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.localeCompare(b)
  })
  return hits.slice(0, limit).map((name) => ({
    key: name,
    label: name,
    insert: `<pool:${name}>`,
    meta: '提示词池',
  }))
}
