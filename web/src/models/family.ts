export type ModelFamily = 'anima' | 'sdxl'

export interface FamilySamplingDefaults {
  width: number
  height: number
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  outputPrefix: string
  negativePrompt: string
}

const ANIMA_DEFAULTS: FamilySamplingDefaults = {
  width: 896,
  height: 1152,
  steps: 30,
  cfg: 4.5,
  sampler: 'er_sde',
  scheduler: 'simple',
  denoise: 1.0,
  outputPrefix: 'anima',
  negativePrompt:
    'worst quality, low quality, score_1, score_2, score_3, ' +
    'artist name, blurry, jpeg artifacts, chromatic aberration',
}

const SDXL_DEFAULTS: FamilySamplingDefaults = {
  width: 832,
  height: 1216,
  steps: 28,
  cfg: 6,
  sampler: 'euler_ancestral',
  scheduler: 'normal',
  denoise: 1.0,
  outputPrefix: 'sdxl',
  negativePrompt:
    '(worst quality, abstract, signature, low quality, normal quality), ' +
    'low contrast, lowres, bad hands, mutated hands, blurry, bad anatomy, ' +
    'bad proportions, extra limbs, watermark, username',
}

export function getFamilyDefaults(family: ModelFamily): FamilySamplingDefaults {
  return family === 'sdxl' ? { ...SDXL_DEFAULTS } : { ...ANIMA_DEFAULTS }
}

export function isModelFamily(value: unknown): value is ModelFamily {
  return value === 'anima' || value === 'sdxl'
}

export function resolveFamily(hints: {
  family?: string | null
  hasAuraFlow?: boolean
  hasCheckpointLoader?: boolean
  unetModel?: string | null
  checkpoint?: string | null
}): ModelFamily {
  if (isModelFamily(hints.family)) return hints.family
  if (hints.hasAuraFlow) return 'anima'
  if (hints.hasCheckpointLoader) return 'sdxl'
  if ((hints.unetModel || '').toLowerCase().includes('anima')) return 'anima'
  if ((hints.checkpoint || '').trim()) return 'sdxl'
  return 'anima'
}
