import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getFamilyDefaults,
  isModelFamily,
  type ModelFamily,
} from '@/models/family'
import { presetNegativePrompt } from '@/prompt/model-prompt-presets'
import {
  expandPromptTemplate,
  hasPromptPlaceholders,
} from '@/prompt/prompt-template'
import { usePromptPoolStore } from '@/stores/promptPool'
import {
  loadParamHistory,
  pushParamHistory,
  saveParamHistory,
  type ParamHistoryEntry,
} from '@/utils/param-history'

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

export interface ResultImage {
  path: string
  dataUrl: string
  filename: string
}

export type GenStatus = 'idle' | 'running' | 'success' | 'error'

/** Max images kept in the preview queue (newest first). */
const MAX_RESULTS = 50

const DEFAULT_PROMPT =
  '1girl,tachibana_arisu,@as109,@ciloranko,nude,bra, panties under pantyhose, bed sheet, on bed,sleep,' +
  'year 2025,masterpiece, best quality,score_9'

export function createDefaultForm(): Txt2ImgForm {
  const anima = getFamilyDefaults('anima')
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
    unetModel: 'anima-base-v1.0.safetensors',
    clipModel: 'qwen_3_06b_base.safetensors',
    clipType: 'stable_diffusion',
    vaeModel: 'qwen_image_vae.safetensors',
    unetWeightDtype: 'default',
    auraflowShift: 3.0,
    checkpoint: '',
    outputPrefix: anima.outputPrefix,
  }
}

function clampClipSkip(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(12, Math.max(1, n))
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

export const useTxt2ImgStore = defineStore('txt2img', () => {
  const form = ref<Txt2ImgForm>(createDefaultForm())
  const status = ref<GenStatus>('idle')
  const errorMessage = ref('')
  const lastSeed = ref<number | null>(null)
  const lastPromptId = ref('')
  const results = ref<ResultImage[]>([])
  const selectedIndex = ref(0)
  const paramHistory = ref<ParamHistoryEntry[]>(loadParamHistory())

  const selectedImage = computed(() => results.value[selectedIndex.value] ?? null)

  function selectImage(index: number): void {
    if (index >= 0 && index < results.value.length) {
      selectedIndex.value = index
    }
  }

  function applyForm(next: Txt2ImgForm): void {
    form.value = normalizeForm(next)
  }

  function setFamily(family: ModelFamily): void {
    if (form.value.family === family) return
    const defaults = getFamilyDefaults(family)
    const prompt = form.value.prompt
    const checkpoint =
      family === 'sdxl'
        ? form.value.checkpoint.trim() || defaults.checkpoint
        : form.value.checkpoint
    form.value = {
      ...form.value,
      family,
      width: defaults.width,
      height: defaults.height,
      steps: defaults.steps,
      cfg: defaults.cfg,
      sampler: defaults.sampler,
      scheduler: defaults.scheduler,
      denoise: defaults.denoise,
      clipSkip: defaults.clipSkip,
      outputPrefix: defaults.outputPrefix,
      negativePrompt: presetNegativePrompt({
        family,
        checkpoint,
        unetModel: form.value.unetModel,
      }),
      prompt,
      checkpoint,
    }
  }

  function restoreHistory(fingerprint: string): boolean {
    const hit = paramHistory.value.find((e) => e.fingerprint === fingerprint)
    if (!hit) return false
    applyForm(hit.form)
    return true
  }

  function expandField(template: string): string {
    if (!hasPromptPlaceholders(template)) return template
    const poolStore = usePromptPoolStore()
    const { prompt, missing } = expandPromptTemplate(
      template,
      form.value.family,
      (name) => poolStore.getByName(name),
      {
        checkpoint: form.value.checkpoint,
        unetModel: form.value.unetModel,
      },
    )
    if (missing.length) {
      throw new Error(`未找到提示词池：${missing.join(', ')}`)
    }
    return prompt
  }

  function resolveRandomPrompts(batchSize: number): {
    prompt: string
    prompts?: string[]
    negativePrompt: string
    negativePrompts?: string[]
  } {
    const posTpl = form.value.prompt
    const negTpl = form.value.negativePrompt
    const needPos = hasPromptPlaceholders(posTpl)
    const needNeg = hasPromptPlaceholders(negTpl)

    if (!needPos && !needNeg) {
      return { prompt: posTpl, negativePrompt: negTpl }
    }

    const expandPair = () => ({
      prompt: expandField(posTpl),
      negativePrompt: expandField(negTpl),
    })

    const first = expandPair()
    if (batchSize <= 1) {
      return first
    }

    const prompts: string[] = [first.prompt]
    const negativePrompts: string[] = [first.negativePrompt]
    for (let i = 1; i < batchSize; i++) {
      const next = expandPair()
      prompts.push(next.prompt)
      negativePrompts.push(next.negativePrompt)
    }
    return {
      prompt: prompts[0],
      prompts: needPos ? prompts : undefined,
      negativePrompt: negativePrompts[0],
      negativePrompts: needNeg ? negativePrompts : undefined,
    }
  }

  async function generate(): Promise<number> {
    status.value = 'running'
    errorMessage.value = ''

    const seedRaw = form.value.seed.trim()
    const seed = seedRaw === '' ? null : Number(seedRaw)
    if (seedRaw !== '' && (!Number.isFinite(seed) || seed! < 0)) {
      status.value = 'error'
      errorMessage.value = 'Seed 必须为空（随机）或非负整数'
      throw new Error(errorMessage.value)
    }

    if (form.value.family === 'sdxl' && !form.value.checkpoint.trim()) {
      status.value = 'error'
      errorMessage.value = 'SDXL 模式需要填写 Checkpoint'
      throw new Error(errorMessage.value)
    }

    const batchSize = Math.max(1, Math.min(Math.floor(Number(form.value.batchSize) || 1), 64))
    let prompt = form.value.prompt
    let prompts: string[] | undefined
    let negativePrompt = form.value.negativePrompt
    let negativePrompts: string[] | undefined

    try {
      await usePromptPoolStore().hydrate()
      const resolved = resolveRandomPrompts(batchSize)
      prompt = resolved.prompt
      prompts = resolved.prompts
      negativePrompt = resolved.negativePrompt
      negativePrompts = resolved.negativePrompts
    } catch (err) {
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      throw err
    }

    const snapshot: Txt2ImgForm = { ...form.value }
    let streamed = 0
    const offImage = window.api.txt2img.onImage((payload) => {
      results.value = [payload.image, ...results.value].slice(0, MAX_RESULTS)
      selectedIndex.value = 0
      lastSeed.value = payload.seed
      lastPromptId.value = payload.promptId
      streamed += 1
    })

    try {
      const result = await window.api.txt2img.generate({
        family: form.value.family,
        prompt,
        prompts,
        negativePrompt,
        negativePrompts,
        width: Number(form.value.width),
        height: Number(form.value.height),
        batchSize,
        steps: Number(form.value.steps),
        cfg: Number(form.value.cfg),
        sampler: form.value.sampler,
        scheduler: form.value.scheduler,
        denoise: Number(form.value.denoise),
        clipSkip: Number(form.value.clipSkip),
        seed,
        unetModel: form.value.unetModel,
        clipModel: form.value.clipModel,
        clipType: form.value.clipType,
        vaeModel: form.value.vaeModel,
        unetWeightDtype: form.value.unetWeightDtype,
        auraflowShift: Number(form.value.auraflowShift),
        checkpoint: form.value.checkpoint,
        outputPrefix: form.value.outputPrefix,
      })

      if (streamed === 0 && result.images.length) {
        results.value = [...result.images, ...results.value].slice(0, MAX_RESULTS)
        selectedIndex.value = 0
      }
      lastSeed.value = result.seed
      lastPromptId.value = result.promptId
      status.value = 'success'

      paramHistory.value = pushParamHistory(paramHistory.value, snapshot)
      saveParamHistory(paramHistory.value)

      return result.images.length
    } catch (err) {
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      offImage()
    }
  }

  async function cancel(): Promise<void> {
    await window.api.txt2img.cancel()
  }

  function clearResults(): void {
    results.value = []
    selectedIndex.value = 0
    lastSeed.value = null
    lastPromptId.value = ''
    status.value = 'idle'
    errorMessage.value = ''
  }

  function setResults(images: ResultImage[]): void {
    results.value = images.slice(0, MAX_RESULTS)
    selectedIndex.value = 0
    lastSeed.value = null
    lastPromptId.value = ''
  }

  function prependResults(images: ResultImage[]): void {
    if (!images.length) return
    const seen = new Set(images.map((img) => img.path))
    const rest = results.value.filter((img) => !seen.has(img.path))
    results.value = [...images, ...rest].slice(0, MAX_RESULTS)
    selectedIndex.value = 0
  }

  return {
    form,
    status,
    errorMessage,
    lastSeed,
    lastPromptId,
    results,
    selectedIndex,
    selectedImage,
    paramHistory,
    selectImage,
    applyForm,
    setFamily,
    restoreHistory,
    generate,
    cancel,
    clearResults,
    setResults,
    prependResults,
  }
})
