import {
  extractLoraTags,
  loraFileStem,
  type LoraTag,
} from '@shared/lora-tag'
import type { ResolvedLora } from '../types'

export type { ResolvedLora, LoraTag }
export { extractLoraTags }

export type NodeRef = [string, number]

export function resolveLoraFileName(requested: string, available: string[]): string | null {
  const req = requested.trim()
  if (!req) return null
  const reqLower = req.toLowerCase()
  const reqStem = loraFileStem(req).toLowerCase()

  const exact = available.find((a) => a === req)
  if (exact) return exact

  const ci = available.find((a) => a.toLowerCase() === reqLower)
  if (ci) return ci

  const byStem = available.filter((a) => loraFileStem(a).toLowerCase() === reqStem)
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
