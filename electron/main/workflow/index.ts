import type { ModelFamily, Txt2ImgParams } from '../types'
import { buildAnimaWorkflow } from './anima'
import { buildSdxlWorkflow } from './sdxl'

export function resolveWorkflowFamily(params: Txt2ImgParams): ModelFamily {
  if (params.family === 'sdxl' || params.family === 'anima') return params.family
  if ((params.unetModel || '').toLowerCase().includes('anima')) return 'anima'
  if ((params.checkpoint || '').trim()) return 'sdxl'
  return 'anima'
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
