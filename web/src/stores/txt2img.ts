import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  loadParamHistory,
  pushParamHistory,
  saveParamHistory,
  type ParamHistoryEntry,
} from '@/utils/param-history'

export interface Txt2ImgForm {
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
  seed: string
  unetModel: string
  clipModel: string
  clipType: string
  vaeModel: string
  unetWeightDtype: string
  auraflowShift: number
  outputPrefix: string
}

export interface ResultImage {
  path: string
  dataUrl: string
  filename: string
}

export type GenStatus = 'idle' | 'running' | 'success' | 'error'

const DEFAULT_PROMPT =
  '1girl,tachibana_arisu,@as109,@ciloranko,nude,bra, panties under pantyhose, bed sheet, on bed,sleep,' +
  'year 2025,masterpiece, best quality,score_9'

const DEFAULT_NEGATIVE =
  'worst quality, low quality, score_1, score_2, score_3, ' +
  'artist name, blurry, jpeg artifacts, chromatic aberration'

export function createDefaultForm(): Txt2ImgForm {
  return {
    prompt: DEFAULT_PROMPT,
    negativePrompt: DEFAULT_NEGATIVE,
    width: 896,
    height: 1152,
    batchSize: 1,
    steps: 30,
    cfg: 4.5,
    sampler: 'er_sde',
    scheduler: 'simple',
    denoise: 1.0,
    seed: '',
    unetModel: 'anima-base-v1.0.safetensors',
    clipModel: 'qwen_3_06b_base.safetensors',
    clipType: 'stable_diffusion',
    vaeModel: 'qwen_image_vae.safetensors',
    unetWeightDtype: 'default',
    auraflowShift: 3.0,
    outputPrefix: 'anima',
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
    form.value = { ...next }
  }

  function restoreHistory(fingerprint: string): boolean {
    const hit = paramHistory.value.find((e) => e.fingerprint === fingerprint)
    if (!hit) return false
    applyForm(hit.form)
    return true
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

    const snapshot: Txt2ImgForm = { ...form.value }
    let streamed = 0
    const offImage = window.api.txt2img.onImage((payload) => {
      results.value = [payload.image, ...results.value].slice(0, 24)
      selectedIndex.value = 0
      lastSeed.value = payload.seed
      lastPromptId.value = payload.promptId
      streamed += 1
    })

    try {
      const result = await window.api.txt2img.generate({
        prompt: form.value.prompt,
        negativePrompt: form.value.negativePrompt,
        width: Number(form.value.width),
        height: Number(form.value.height),
        batchSize: Number(form.value.batchSize),
        steps: Number(form.value.steps),
        cfg: Number(form.value.cfg),
        sampler: form.value.sampler,
        scheduler: form.value.scheduler,
        denoise: Number(form.value.denoise),
        seed,
        unetModel: form.value.unetModel,
        clipModel: form.value.clipModel,
        clipType: form.value.clipType,
        vaeModel: form.value.vaeModel,
        unetWeightDtype: form.value.unetWeightDtype,
        auraflowShift: Number(form.value.auraflowShift),
        outputPrefix: form.value.outputPrefix,
      })

      if (streamed === 0 && result.images.length) {
        results.value = [...result.images, ...results.value].slice(0, 24)
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
    results.value = images.slice(0, 24)
    selectedIndex.value = 0
    lastSeed.value = null
    lastPromptId.value = ''
  }

  /** 将新图插到列表最前（最新），保留已有预览 */
  function prependResults(images: ResultImage[]): void {
    if (!images.length) return
    const seen = new Set(images.map((img) => img.path))
    const rest = results.value.filter((img) => !seen.has(img.path))
    results.value = [...images, ...rest].slice(0, 24)
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
    restoreHistory,
    generate,
    cancel,
    clearResults,
    setResults,
    prependResults,
  }
})
