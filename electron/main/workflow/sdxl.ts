import type { Txt2ImgParams } from '../types'
import { applyClipSkip } from './clip'
import { appendLoraChain } from './lora'
import { resolveSeed } from './seed'

/** SDXL / Pony / Illustrious：CheckpointLoaderSimple 标准图。 */
export function buildSdxlWorkflow(
  params: Txt2ImgParams,
  seedOverride?: number,
): { workflow: Record<string, unknown>; seed: number } {
  const seed = resolveSeed(params.seed, seedOverride)
  const ckpt = (params.checkpoint || '').trim()
  if (!ckpt) {
    throw new Error('SDXL 模式需要填写 Checkpoint')
  }

  const workflow: Record<string, unknown> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: ckpt,
      },
    },
  }

  const { modelRef, clipRef: loraClip } = appendLoraChain(workflow, {
    modelRef: ['1', 0],
    clipRef: ['1', 1],
    loras: params.loras ?? [],
  })
  const clipRef = applyClipSkip(workflow, loraClip, params.clipSkip)

  workflow['2'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      clip: clipRef,
      text: params.prompt,
    },
  }
  workflow['3'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      clip: clipRef,
      text: params.negativePrompt,
    },
  }
  workflow['4'] = {
    class_type: 'EmptyLatentImage',
    inputs: {
      width: params.width,
      height: params.height,
      batch_size: 1,
    },
  }
  workflow['5'] = {
    class_type: 'KSampler',
    inputs: {
      model: modelRef,
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
      seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      denoise: params.denoise,
    },
  }
  workflow['6'] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['5', 0],
      vae: ['1', 2],
    },
  }
  workflow['7'] = {
    class_type: 'SaveImage',
    inputs: {
      images: ['6', 0],
      filename_prefix: params.outputPrefix || 'sdxl',
    },
  }

  return { workflow, seed }
}
