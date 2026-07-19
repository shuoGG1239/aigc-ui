import type { ResolvedLora } from '../types'

export type { ResolvedLora }

export interface LoraTag {
  name: string
  strengthModel: number
  strengthClip: number
}

export type NodeRef = [string, number]

const LORA_TAG_RE = /<lora:([^:>]+)(?::([^:>]*))?(?::([^:>]*))?>/gi

function parseStrength(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function stripLoraTags(text: string): string {
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

function fileStem(path: string): string {
  const base = path.replace(/^.*[/\\]/, '')
  return base.replace(/\.(safetensors|pt|ckpt)$/i, '')
}

export function resolveLoraFileName(requested: string, available: string[]): string | null {
  const req = requested.trim()
  if (!req) return null
  const reqLower = req.toLowerCase()
  const reqStem = fileStem(req).toLowerCase()

  const exact = available.find((a) => a === req)
  if (exact) return exact

  const ci = available.find((a) => a.toLowerCase() === reqLower)
  if (ci) return ci

  const byStem = available.filter((a) => fileStem(a).toLowerCase() === reqStem)
  if (byStem.length === 1) return byStem[0]
  if (byStem.length > 1) {
    const prefer = byStem.find((a) => a.toLowerCase().endsWith('.safetensors'))
    return prefer || byStem[0]
  }

  return null
}

export function resolveLoras(loras: LoraTag[], available: string[]): ResolvedLora[] {
  return loras.map((lora) => {
    const fileName = resolveLoraFileName(lora.name, available)
    if (!fileName) {
      throw new Error(`未找到 LoRA: ${lora.name}`)
    }
    return { ...lora, fileName }
  })
}

/** Chain native LoraLoader nodes; returns final model/clip refs. */
export function appendLoraChain(
  workflow: Record<string, unknown>,
  opts: {
    modelRef: NodeRef
    clipRef: NodeRef
    loras: ResolvedLora[]
  },
): { modelRef: NodeRef; clipRef: NodeRef } {
  let modelRef = opts.modelRef
  let clipRef = opts.clipRef
  opts.loras.forEach((lora, i) => {
    const id = `lora_${i + 1}`
    workflow[id] = {
      class_type: 'LoraLoader',
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: lora.fileName,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
    }
    modelRef = [id, 0]
    clipRef = [id, 1]
  })
  return { modelRef, clipRef }
}
