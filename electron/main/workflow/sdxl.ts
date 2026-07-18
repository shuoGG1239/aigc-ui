import type { Txt2ImgParams } from '../types'
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
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: params.prompt,
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: params.negativePrompt,
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: params.width,
        height: params.height,
        batch_size: 1,
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
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
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],
      },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        images: ['6', 0],
        filename_prefix: params.outputPrefix || 'sdxl',
      },
    },
  }

  return { workflow, seed }
}
