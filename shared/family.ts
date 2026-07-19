import { presetNegativePrompt } from './model-prompt-presets'

export type ModelFamily = 'anima' | 'sdxl'

export interface FamilySamplingDefaults {
  width: number
  height: number
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  /** A1111 Clip skip; SDXL anime checkpoints commonly use 2. */
  clipSkip: number
  /** SDXL checkpoint filename; empty for Anima. */
  checkpoint: string
  outputPrefix: string
  negativePrompt: string
}

/** Anima (Qwen/AuraFlow) loader filenames & sampling shift. */
export interface AnimaModelDefaults {
  unetModel: string
  clipModel: string
  clipType: string
  vaeModel: string
  unetWeightDtype: string
  auraflowShift: number
}

const SDXL_CHECKPOINT = 'noobaiXLNAIXL_vPred10Version.safetensors'

const ANIMA_DEFAULTS: FamilySamplingDefaults = {
  width: 896,
  height: 1152,
  steps: 30,
  cfg: 4.5,
  sampler: 'er_sde',
  scheduler: 'simple',
  denoise: 1.0,
  clipSkip: 1,
  checkpoint: '',
  outputPrefix: 'anima',
  negativePrompt: presetNegativePrompt({ family: 'anima' }),
}

const SDXL_DEFAULTS: FamilySamplingDefaults = {
  width: 832,
  height: 1216,
  steps: 28,
  cfg: 6,
  sampler: 'euler_ancestral',
  scheduler: 'normal',
  denoise: 1.0,
  clipSkip: 2,
  checkpoint: SDXL_CHECKPOINT,
  outputPrefix: 'sdxl',
  negativePrompt: presetNegativePrompt({
    family: 'sdxl',
    checkpoint: SDXL_CHECKPOINT,
  }),
}

const ANIMA_MODEL_DEFAULTS: AnimaModelDefaults = {
  unetModel: 'anima-base-v1.0.safetensors',
  clipModel: 'qwen_3_06b_base.safetensors',
  clipType: 'stable_diffusion',
  vaeModel: 'qwen_image_vae.safetensors',
  unetWeightDtype: 'default',
  auraflowShift: 3.0,
}

export function getFamilyDefaults(family: ModelFamily): FamilySamplingDefaults {
  return family === 'sdxl' ? { ...SDXL_DEFAULTS } : { ...ANIMA_DEFAULTS }
}

export function getAnimaModelDefaults(): AnimaModelDefaults {
  return { ...ANIMA_MODEL_DEFAULTS }
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
