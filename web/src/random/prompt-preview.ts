/** Normalize prompt / filename stem for preview lookup. */
export function normalizePreviewKey(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''

  // Unwrap `(tag:1.2)` strength form.
  const weighted = s.match(/^\((.+):([\d.]+)\)$/)
  if (weighted) s = weighted[1].trim()

  if (s.startsWith('@')) s = s.slice(1)
  s = s.replace(/\s+/g, '_').toLowerCase()
  return s
}

/** Candidate keys from a pool entry prompt (full text + comma segments). */
export function previewKeysFromPrompt(prompt: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  const push = (raw: string): void => {
    const key = normalizePreviewKey(raw)
    if (!key || seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }

  push(prompt)
  for (const part of prompt.split(/[,，]/)) {
    push(part)
  }
  return keys
}
