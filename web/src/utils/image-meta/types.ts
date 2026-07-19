import type { ModelFamily } from '@shared/family'

export type ImageMetaSource = 'comfyui' | 'a1111' | 'novelai' | 'unknown'

/** Normalized generation metadata from PNG / clipboard. */
export interface ImageMeta {
  source: ImageMetaSource
  prompt: string
  negativePrompt: string
  width: number | null
  height: number | null
  steps: number | null
  cfg: number | null
  sampler: string
  scheduler: string
  /** A1111 Clip skip / ComfyUI |stop_at_clip_layer|. */
  clipSkip: number | null
  seed: string
  model: string
  family: ModelFamily | null
}

export interface ImageMetaParseResult {
  meta: ImageMeta
  /** Raw PNG text chunks / JSON blob used for “原始详情”. */
  raw: Record<string, unknown>
}
