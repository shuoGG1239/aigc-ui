import type { Txt2ImgParams } from '../types'
import { resolveSeed } from './seed'

/** 工作流内 latent batch 固定为 1；UI 的 batchSize 由主进程循环多次提交实现。 */
export function buildAnimaWorkflow(
  params: Txt2ImgParams,
  seedOverride?: number,
): { workflow: Record<string, unknown>; seed: number } {
  const seed = resolveSeed(params.seed, seedOverride)

  const workflow: Record<string, unknown> = {
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: params.unetModel,
        weight_dtype: params.unetWeightDtype,
      },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: params.clipModel,
        type: params.clipType,
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: params.vaeModel },
    },
    '4': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        model: ['1', 0],
        shift: params.auraflowShift,
      },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: params.prompt,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: params.negativePrompt,
      },
    },
    '7': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: params.width,
        height: params.height,
        batch_size: 1,
      },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
        seed,
        steps: params.steps,
        cfg: params.cfg,
        sampler_name: params.sampler,
        scheduler: params.scheduler,
        denoise: params.denoise,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['3', 0],
      },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: {
        images: ['9', 0],
        filename_prefix: params.outputPrefix || 'anima',
      },
    },
  }

  return { workflow, seed }
}
