import { ComfyClass } from '@shared/comfy-class'
import { getFamilyDefaults, resolveFamily } from '@shared/family'
import { formatLoraTag } from '@shared/lora-tag'
import { createDefaultForm, normalizeForm, type Txt2ImgForm } from '@shared/txt2img-form'
import { asRecord, emptyMeta, num, str } from './helpers'
import type { ImageMeta } from './types'

interface ComfyNode {
  class_type?: string
  inputs?: Record<string, unknown>
}

/** ComfyUI workflow → summary fields. */
export function parseComfyUiMeta(raw: Record<string, unknown>): ImageMeta | null {
  const form = parseComfyUiToForm(raw)
  if (!form) return null
  const meta = emptyMeta('comfyui')
  meta.prompt = form.prompt
  meta.negativePrompt = form.negativePrompt
  meta.width = form.width
  meta.height = form.height
  meta.steps = form.steps
  meta.cfg = form.cfg
  meta.sampler = form.sampler
  meta.scheduler = form.scheduler
  meta.clipSkip = form.clipSkip
  meta.seed = form.seed
  meta.family = form.family
  meta.model = form.family === 'sdxl' ? form.checkpoint : form.unetModel || form.checkpoint
  return meta
}

/** Full txt2img form from ComfyUI graph (models / dtype / shift included). */
export function parseComfyUiToForm(raw: Record<string, unknown>): Txt2ImgForm | null {
  const graph = extractGraph(raw)
  if (!graph) return null

  const form = createDefaultForm()
  const nodes = Object.entries(graph)

  const hasAuraFlow = nodes.some(([, n]) => n.class_type === ComfyClass.ModelSamplingAuraFlow)
  const hasCheckpointLoader = nodes.some(
    ([, n]) => n.class_type === ComfyClass.CheckpointLoaderSimple,
  )
  const unet = findFirst(nodes, ComfyClass.UNETLoader)
  const ckpt = findFirst(nodes, ComfyClass.CheckpointLoaderSimple)

  form.family = resolveFamily({
    hasAuraFlow,
    hasCheckpointLoader,
    unetModel: unet ? str(unet.inputs?.unet_name) : '',
    checkpoint: ckpt ? str(ckpt.inputs?.ckpt_name) : '',
  })

  const defaults = getFamilyDefaults(form.family)
  form.width = defaults.width
  form.height = defaults.height
  form.steps = defaults.steps
  form.cfg = defaults.cfg
  form.sampler = defaults.sampler
  form.scheduler = defaults.scheduler
  form.denoise = defaults.denoise
  form.clipSkip = defaults.clipSkip
  form.checkpoint = defaults.checkpoint
  form.outputPrefix = defaults.outputPrefix
  form.negativePrompt = defaults.negativePrompt

  if (unet) {
    form.unetModel = str(unet.inputs?.unet_name, form.unetModel)
    form.unetWeightDtype = str(unet.inputs?.weight_dtype, form.unetWeightDtype)
  }
  if (ckpt) form.checkpoint = str(ckpt.inputs?.ckpt_name, form.checkpoint)

  const clip = findFirst(nodes, ComfyClass.CLIPLoader)
  if (clip) {
    form.clipModel = str(clip.inputs?.clip_name, form.clipModel)
    form.clipType = str(clip.inputs?.type, form.clipType)
  }

  const vae = findFirst(nodes, ComfyClass.VAELoader)
  if (vae) form.vaeModel = str(vae.inputs?.vae_name, form.vaeModel)

  const aura = findFirst(nodes, ComfyClass.ModelSamplingAuraFlow)
  if (aura) form.auraflowShift = num(aura.inputs?.shift) ?? form.auraflowShift

  const clipSkipNode = findFirst(nodes, ComfyClass.CLIPSetLastLayer)
  if (clipSkipNode) {
    const layer = num(clipSkipNode.inputs?.stop_at_clip_layer)
    if (layer != null && layer !== 0) form.clipSkip = Math.abs(Math.round(layer))
  }

  const latent = findFirst(nodes, ComfyClass.EmptyLatentImage)
  if (latent) {
    form.width = Math.round(num(latent.inputs?.width) ?? form.width)
    form.height = Math.round(num(latent.inputs?.height) ?? form.height)
  }

  let gotPrompt = false
  let gotNegative = false
  const sampler = findFirst(nodes, ComfyClass.KSampler)
  if (sampler) {
    form.steps = Math.round(num(sampler.inputs?.steps) ?? form.steps)
    form.cfg = num(sampler.inputs?.cfg) ?? form.cfg
    form.sampler = str(sampler.inputs?.sampler_name, form.sampler)
    form.scheduler = str(sampler.inputs?.scheduler, form.scheduler)
    form.denoise = num(sampler.inputs?.denoise) ?? form.denoise
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
    const encodes = nodes.filter(([, n]) => n.class_type === ComfyClass.CLIPTextEncode)
    encodes.sort(([a], [b]) => Number(a) - Number(b))
    if (!gotPrompt && encodes[0]?.[1].inputs?.text !== undefined) {
      form.prompt = String(encodes[0][1].inputs!.text)
    }
    if (!gotNegative && encodes[1]?.[1].inputs?.text !== undefined) {
      form.negativePrompt = String(encodes[1][1].inputs!.text)
    }
  }

  // aigc-ui strips <lora:> from CLIP text at generate time; restore from LoraLoader.
  form.prompt = prependMissingLoraTags(form.prompt, collectLoraTagsFromGraph(nodes))

  const save = findFirst(nodes, ComfyClass.SaveImage)
  if (save) form.outputPrefix = str(save.inputs?.filename_prefix, form.outputPrefix)

  return normalizeForm(form)
}

/** Collect `<lora:…>` tags from LoraLoader nodes (lora_1, lora_2, … then other ids). */
function collectLoraTagsFromGraph(nodes: [string, ComfyNode][]): string[] {
  const loaders = nodes.filter(([, n]) => n.class_type === ComfyClass.LoraLoader)
  loaders.sort(([a], [b]) => {
    const na = /^lora_(\d+)$/i.exec(a)
    const nb = /^lora_(\d+)$/i.exec(b)
    if (na && nb) return Number(na[1]) - Number(nb[1])
    if (na) return -1
    if (nb) return 1
    return a.localeCompare(b)
  })

  const tags: string[] = []
  for (const [, node] of loaders) {
    const name = str(node.inputs?.lora_name)
    if (!name) continue
    const sm = num(node.inputs?.strength_model) ?? 1
    const sc = num(node.inputs?.strength_clip) ?? sm
    tags.push(formatLoraTag(name, sm, sc))
  }
  return tags
}

function prependMissingLoraTags(prompt: string, tags: string[]): string {
  if (!tags.length) return prompt
  const existing = prompt.toLowerCase()
  const missing = tags.filter((tag) => {
    const m = tag.match(/^<lora:([^:>]+)/i)
    if (!m) return true
    const stem = m[1].toLowerCase()
    return !existing.includes(`<lora:${stem}`)
  })
  if (!missing.length) return prompt
  const head = missing.join(', ')
  const body = prompt.trim()
  return body ? `${head}, ${body}` : head
}

function extractGraph(data: unknown): Record<string, ComfyNode> | null {
  const root = asRecord(data)
  if (!root) return null

  if (root.prompt != null) {
    if (typeof root.prompt === 'string') {
      try {
        const parsed = JSON.parse(root.prompt)
        if (looksLikeGraph(parsed)) return parsed as Record<string, ComfyNode>
      } catch {
        // not JSON workflow
      }
    } else if (looksLikeGraph(root.prompt)) {
      return root.prompt as Record<string, ComfyNode>
    }
  }

  if (looksLikeGraph(root)) return root as Record<string, ComfyNode>
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

function findFirst(nodes: [string, ComfyNode][], classType: string): ComfyNode | null {
  const hit = nodes.find(([, n]) => n.class_type === classType)
  return hit?.[1] ?? null
}

function linkNodeId(link: unknown): string | null {
  if (Array.isArray(link) && link.length >= 1) return String(link[0])
  return null
}
