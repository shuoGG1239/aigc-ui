import { getFamilyDefaults, resolveFamily } from '@/models/family'
import { createDefaultForm, normalizeForm, type Txt2ImgForm } from '@/stores/txt2img'

interface ComfyNode {
  class_type?: string
  inputs?: Record<string, unknown>
}

/** Parse ComfyUI PNG metadata / workflow JSON into form fields. */
export function parseWorkflowParams(text: string): Txt2ImgForm {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是有效 JSON')
  }

  const graph = extractGraph(data)
  if (!graph) {
    throw new Error('未找到 ComfyUI workflow（prompt）数据')
  }

  const form = createDefaultForm()
  const nodes = Object.entries(graph)

  const hasAuraFlow = nodes.some(([, n]) => n.class_type === 'ModelSamplingAuraFlow')
  const hasCheckpointLoader = nodes.some(([, n]) => n.class_type === 'CheckpointLoaderSimple')
  const unet = findFirst(nodes, 'UNETLoader')
  const ckpt = findFirst(nodes, 'CheckpointLoaderSimple')

  form.family = resolveFamily({
    hasAuraFlow,
    hasCheckpointLoader,
    unetModel: unet ? str(unet.inputs?.unet_name, '') : '',
    checkpoint: ckpt ? str(ckpt.inputs?.ckpt_name, '') : '',
  })

  const defaults = getFamilyDefaults(form.family)
  form.width = defaults.width
  form.height = defaults.height
  form.steps = defaults.steps
  form.cfg = defaults.cfg
  form.sampler = defaults.sampler
  form.scheduler = defaults.scheduler
  form.denoise = defaults.denoise
  form.outputPrefix = defaults.outputPrefix
  form.negativePrompt = defaults.negativePrompt

  if (unet) {
    form.unetModel = str(unet.inputs?.unet_name, form.unetModel)
    form.unetWeightDtype = str(unet.inputs?.weight_dtype, form.unetWeightDtype)
  }

  if (ckpt) {
    form.checkpoint = str(ckpt.inputs?.ckpt_name, form.checkpoint)
  }

  const clip = findFirst(nodes, 'CLIPLoader')
  if (clip) {
    form.clipModel = str(clip.inputs?.clip_name, form.clipModel)
    form.clipType = str(clip.inputs?.type, form.clipType)
  }

  const vae = findFirst(nodes, 'VAELoader')
  if (vae) {
    form.vaeModel = str(vae.inputs?.vae_name, form.vaeModel)
  }

  const aura = findFirst(nodes, 'ModelSamplingAuraFlow')
  if (aura) {
    form.auraflowShift = num(aura.inputs?.shift, form.auraflowShift)
  }

  const latent = findFirst(nodes, 'EmptyLatentImage')
  if (latent) {
    form.width = Math.round(num(latent.inputs?.width, form.width))
    form.height = Math.round(num(latent.inputs?.height, form.height))
  }

  let gotPrompt = false
  let gotNegative = false

  const sampler = findFirst(nodes, 'KSampler')
  if (sampler) {
    form.steps = Math.round(num(sampler.inputs?.steps, form.steps))
    form.cfg = num(sampler.inputs?.cfg, form.cfg)
    form.sampler = str(sampler.inputs?.sampler_name, form.sampler)
    form.scheduler = str(sampler.inputs?.scheduler, form.scheduler)
    form.denoise = num(sampler.inputs?.denoise, form.denoise)
    if (sampler.inputs?.seed !== undefined && sampler.inputs?.seed !== null) {
      form.seed = String(sampler.inputs.seed)
    }

    const posId = linkNodeId(sampler.inputs?.positive)
    const negId = linkNodeId(sampler.inputs?.negative)
    if (posId && graph[posId]?.inputs?.text !== undefined) {
      form.prompt = String(graph[posId].inputs!.text)
      gotPrompt = true
    }
    if (negId && graph[negId]?.inputs?.text !== undefined) {
      form.negativePrompt = String(graph[negId].inputs!.text)
      gotNegative = true
    }
  }

  if (!gotPrompt || !gotNegative) {
    const encodes = nodes.filter(([, n]) => n.class_type === 'CLIPTextEncode')
    encodes.sort(([a], [b]) => Number(a) - Number(b))
    if (!gotPrompt && encodes[0]?.[1].inputs?.text !== undefined) {
      form.prompt = String(encodes[0][1].inputs!.text)
    }
    if (!gotNegative && encodes[1]?.[1].inputs?.text !== undefined) {
      form.negativePrompt = String(encodes[1][1].inputs!.text)
    }
  }

  const save = findFirst(nodes, 'SaveImage')
  if (save) {
    form.outputPrefix = str(save.inputs?.filename_prefix, form.outputPrefix)
  }

  return normalizeForm(form)
}

function extractGraph(data: unknown): Record<string, ComfyNode> | null {
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>

  if (root.prompt && typeof root.prompt === 'object' && looksLikeGraph(root.prompt)) {
    return root.prompt as Record<string, ComfyNode>
  }
  if (looksLikeGraph(root)) {
    return root as Record<string, ComfyNode>
  }
  return null
}

function looksLikeGraph(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.values(value as Record<string, unknown>)
  if (!entries.length) return false
  return entries.some(
    (n) => n && typeof n === 'object' && typeof (n as ComfyNode).class_type === 'string',
  )
}

function findFirst(
  nodes: [string, ComfyNode][],
  classType: string,
): ComfyNode | null {
  const hit = nodes.find(([, n]) => n.class_type === classType)
  return hit?.[1] ?? null
}

function linkNodeId(link: unknown): string | null {
  if (Array.isArray(link) && link.length >= 1) return String(link[0])
  return null
}

function str(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
