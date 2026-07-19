import { formatLoraTag } from '@shared/lora-tag'

export type CompleteMode = 'tag' | 'lora'

export interface CaretToken {
  mode: CompleteMode
  /** Range in full text to replace on accept. */
  start: number
  end: number
  /** Query used for filtering (no `<lora:` prefix). */
  query: string
}

/**
 * Resolve the token being typed at `caret` for tag / LoRA autocomplete.
 */
export function getCaretToken(text: string, caret: number): CaretToken | null {
  const pos = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, pos)

  // Inside any unclosed `<…>`: only offer LoRA completion for `<lora…`
  const lt = before.lastIndexOf('<')
  if (lt >= 0) {
    const frag = before.slice(lt)
    if (!frag.includes('>')) {
      if (/^<lora?:?$/i.test(frag)) {
        return { mode: 'lora', start: lt, end: pos, query: '' }
      }
      if (/^<lora:/i.test(frag)) {
        return {
          mode: 'lora',
          start: lt,
          end: pos,
          query: frag.replace(/^<lora:/i, ''),
        }
      }
      // e.g. <pool: / <random: — do not tag-complete inside
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
