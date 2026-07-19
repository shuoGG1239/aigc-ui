import { getFamilyDefaults, type ModelFamily } from '@shared/family'
import { createDefaultForm, normalizeForm, type Txt2ImgForm } from '@shared/txt2img-form'
import type { ImageMeta } from './types'

export interface ImageMetaToFormOptions {
  /** Keep UI family (e.g. Anima) instead of guessing from PNG source. */
  preferFamily?: ModelFamily | null
  /** Merge onto current form (models / family settings preserved). */
  base?: Txt2ImgForm | null
}

/** Map parsed image metadata onto the txt2img form (best-effort). */
export function imageMetaToForm(
  meta: ImageMeta,
  opts: ImageMetaToFormOptions = {},
): Txt2ImgForm {
  const form = opts.base ? { ...opts.base } : createDefaultForm()
  const family = opts.preferFamily ?? meta.family ?? form.family
  if (!opts.base) {
    Object.assign(form, getFamilyDefaults(family))
  }
  form.family = family

  if (meta.prompt) form.prompt = meta.prompt
  if (meta.negativePrompt) form.negativePrompt = meta.negativePrompt
  if (meta.width != null) form.width = meta.width
  if (meta.height != null) form.height = meta.height
  if (meta.steps != null) form.steps = meta.steps
  if (meta.cfg != null) form.cfg = meta.cfg
  if (meta.sampler) form.sampler = meta.sampler
  if (meta.scheduler) form.scheduler = meta.scheduler
  if (meta.clipSkip != null) form.clipSkip = meta.clipSkip
  if (meta.seed) form.seed = meta.seed

  // Avoid stuffing NovelAI "Source" labels into unet/checkpoint when merging / preferring family.
  const applyModel =
    !!meta.model &&
    !opts.base &&
    (meta.source === 'a1111' || meta.source === 'comfyui' || !opts.preferFamily)
  if (applyModel && meta.model) {
    if (family === 'sdxl') form.checkpoint = meta.model
    else form.unetModel = meta.model
  }

  return normalizeForm(form)
}
