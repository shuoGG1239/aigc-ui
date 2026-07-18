import type { ModelFamily } from '@/models/family'

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
  seed: string
  model: string
  family: ModelFamily | null
}

export interface ImageMetaParseResult {
  meta: ImageMeta
  /** Raw PNG text chunks / JSON blob used for “原始详情”. */
  raw: Record<string, unknown>
}
