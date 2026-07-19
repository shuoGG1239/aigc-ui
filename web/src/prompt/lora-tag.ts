/** Shared `<lora:…>` parse / format / stem (web + electron). */

export interface LoraTag {
  name: string
  strengthModel: number
  strengthClip: number
}

const LORA_TAG_RE = /<lora:([^:>]+)(?::([^:>]*))?(?::([^:>]*))?>/gi

export function loraFileStem(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '')
  return base.replace(/\.(safetensors|pt|ckpt)$/i, '')
}

export function formatLoraTag(
  fileNameOrStem: string,
  strengthModel = 1,
  strengthClip: number = strengthModel,
): string {
  const stem = loraFileStem(fileNameOrStem)
  const sm = Number.isFinite(strengthModel) ? strengthModel : 1
  const sc = Number.isFinite(strengthClip) ? strengthClip : sm
  if (sm === sc) return `<lora:${stem}:${sm}>`
  return `<lora:${stem}:${sm}:${sc}>`
}

function parseStrength(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function stripLoraTags(text: string): string {
  return text
    .replace(/<lora:[^>]*>/gi, '')
    .replace(/,\s*,+/g, ',')
    .replace(/^\s*,\s*/g, '')
    .replace(/\s*,\s*$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function collectFromText(text: string, order: string[], byKey: Map<string, LoraTag>): void {
  LORA_TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LORA_TAG_RE.exec(text)) !== null) {
    const name = m[1].trim()
    if (!name) continue
    const key = name.toLowerCase()
    const s1 = m[2]
    const s2 = m[3]
    let strengthModel = 1
    let strengthClip = 1
    if (s1 !== undefined) {
      strengthModel = parseStrength(s1, 1)
      strengthClip = s2 !== undefined ? parseStrength(s2, strengthModel) : strengthModel
    }
    if (!byKey.has(key)) order.push(key)
    byKey.set(key, { name, strengthModel, strengthClip })
  }
}

/** Parse `<lora:…>` from prompt + negative; strip tags from both; merge same name (latter wins). */
export function extractLoraTags(
  prompt: string,
  negativePrompt: string,
): { prompt: string; negativePrompt: string; loras: LoraTag[] } {
  const order: string[] = []
  const byKey = new Map<string, LoraTag>()
  collectFromText(prompt || '', order, byKey)
  collectFromText(negativePrompt || '', order, byKey)
  return {
    prompt: stripLoraTags(prompt || ''),
    negativePrompt: stripLoraTags(negativePrompt || ''),
    loras: order.map((k) => byKey.get(k)!),
  }
}
