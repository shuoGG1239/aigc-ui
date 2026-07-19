import { resolveFamily, type ModelFamily } from '../../../web/src/models/family'
import type { Txt2ImgParams } from '../types'
import { buildAnimaWorkflow } from './anima'
import { buildSdxlWorkflow } from './sdxl'

export function resolveWorkflowFamily(params: Txt2ImgParams): ModelFamily {
  return resolveFamily({
    family: params.family,
    unetModel: params.unetModel,
    checkpoint: params.checkpoint,
  })
}

export function buildWorkflow(
  params: Txt2ImgParams,
  seedOverride?: number,
): { workflow: Record<string, unknown>; seed: number; family: ModelFamily } {
  const family = resolveWorkflowFamily(params)
  const built =
    family === 'sdxl'
      ? buildSdxlWorkflow(params, seedOverride)
      : buildAnimaWorkflow(params, seedOverride)
  return { ...built, family }
}

export { buildAnimaWorkflow } from './anima'
export { buildSdxlWorkflow } from './sdxl'
