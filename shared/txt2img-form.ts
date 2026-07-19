import {
  getAnimaModelDefaults,
  getFamilyDefaults,
  isModelFamily,
  type ModelFamily,
} from './family'
import { clampClipSkip } from './limits'

/** Renderer form shape (seed as string for empty = random). */
export interface Txt2ImgForm {
  family: ModelFamily
  prompt: string
  negativePrompt: string
  width: number
  height: number
  batchSize: number
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  /** A1111 Clip skip → ComfyUI CLIPSetLastLayer(-N). */
  clipSkip: number
  seed: string
  unetModel: string
  clipModel: string
  clipType: string
  vaeModel: string
  unetWeightDtype: string
  auraflowShift: number
  checkpoint: string
  outputPrefix: string
}

const DEFAULT_PROMPT =
  '1girl,tachibana_arisu,@as109,@ciloranko,nude,bra, panties under pantyhose, bed sheet, on bed,sleep,' +
  'year 2025,masterpiece, best quality,score_9'

export function createDefaultForm(): Txt2ImgForm {
  const anima = getFamilyDefaults('anima')
  const models = getAnimaModelDefaults()
  return {
    family: 'anima',
    prompt: DEFAULT_PROMPT,
    negativePrompt: anima.negativePrompt,
    width: anima.width,
    height: anima.height,
    batchSize: 1,
    steps: anima.steps,
    cfg: anima.cfg,
    sampler: anima.sampler,
    scheduler: anima.scheduler,
    denoise: anima.denoise,
    clipSkip: anima.clipSkip,
    seed: '',
    unetModel: models.unetModel,
    clipModel: models.clipModel,
    clipType: models.clipType,
    vaeModel: models.vaeModel,
    unetWeightDtype: models.unetWeightDtype,
    auraflowShift: models.auraflowShift,
    checkpoint: '',
    outputPrefix: anima.outputPrefix,
  }
}

export function normalizeForm(partial: Partial<Txt2ImgForm> | null | undefined): Txt2ImgForm {
  const base = createDefaultForm()
  if (!partial || typeof partial !== 'object') return base
  const family = isModelFamily(partial.family) ? partial.family : base.family
  const familyDefaults = getFamilyDefaults(family)
  return {
    ...base,
    ...partial,
    family,
    checkpoint: typeof partial.checkpoint === 'string' ? partial.checkpoint : base.checkpoint,
    clipSkip: clampClipSkip(partial.clipSkip, familyDefaults.clipSkip),
  }
}
