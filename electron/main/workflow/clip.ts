import { ComfyClass } from '@shared/comfy-class'
import type { NodeRef } from './lora'

/**
 * A1111 Clip skip N → ComfyUI CLIPSetLastLayer stop_at_clip_layer: -N.
 * Skip 1 (or unset) matches default CLIP (no node).
 */
export function applyClipSkip(
  workflow: Record<string, unknown>,
  clipRef: NodeRef,
  clipSkip: number | undefined,
  nodeId = 'clip_skip',
): NodeRef {
  const n = Math.floor(Number(clipSkip))
  if (!Number.isFinite(n) || n <= 1) return clipRef
  workflow[nodeId] = {
    class_type: ComfyClass.CLIPSetLastLayer,
    inputs: {
      clip: clipRef,
      stop_at_clip_layer: -n,
    },
  }
  return [nodeId, 0]
}
