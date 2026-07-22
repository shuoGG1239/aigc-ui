import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getFamilyDefaults,
  type ModelFamily,
} from '@shared/family'
import { clampBatchSize, clampParamHistoryMax } from '@shared/limits'
import { presetNegativePrompt } from '@shared/model-prompt-presets'
import type { GenerateProgress } from '@shared/ipc-types'
import {
  createDefaultForm,
  normalizeForm,
  type Txt2ImgForm,
} from '@shared/txt2img-form'
import {
  expandPromptTemplate,
  hasPromptPlaceholders,
} from '@/prompt/prompt-template'
import { usePromptPoolStore } from '@/stores/prompt-pool'
import { useSettingsStore } from '@/stores/settings'
import {
  attachParamHistoryPreviews,
  formFingerprint,
  loadParamHistory,
  pushParamHistory,
  saveParamHistory,
  toggleStarParamHistory,
  trimParamHistory,
  type ParamHistoryEntry,
} from '@/utils/param-history'

export type { Txt2ImgForm }
export { createDefaultForm, normalizeForm }

export interface ResultImage {
  path: string
  dataUrl: string
  filename: string
}

export type GenStatus = 'idle' | 'running' | 'success' | 'error'

/** Max images kept in the preview queue (newest first). */
const MAX_RESULTS = 50

export const useTxt2ImgStore = defineStore('txt2img', () => {
  const form = ref<Txt2ImgForm>(createDefaultForm())
  const status = ref<GenStatus>('idle')
  const errorMessage = ref('')
  const lastSeed = ref<number | null>(null)
  const lastPromptId = ref('')
  const results = ref<ResultImage[]>([])
  const selectedIndex = ref(0)
  const paramHistory = ref<ParamHistoryEntry[]>(loadParamHistory())
  const progress = ref<GenerateProgress | null>(null)

  const selectedImage = computed(() => results.value[selectedIndex.value] ?? null)

  const progressLabel = computed(() => {
    const p = progress.value
    if (!p || status.value !== 'running') return ''
    const batch =
      p.total > 1 ? `${p.index + 1}/${p.total}` : ''
    if (p.phase === 'queued') {
      return batch ? `排队 ${batch}` : '排队中'
    }
    if (p.max > 0) {
      const steps = `${p.value}/${p.max}`
      return batch ? `${steps} · ${batch}` : steps
    }
    return batch ? `生成中 ${batch}` : '生成中'
  })

  const progressPercent = computed(() => {
    const p = progress.value
    if (!p || status.value !== 'running' || p.total <= 0) return 0
    const stepFrac = p.max > 0 ? Math.min(1, Math.max(0, p.value / p.max)) : 0
    return Math.round(((p.index + stepFrac) / p.total) * 100)
  })

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

  function historyMax(): number {
    return clampParamHistoryMax(useSettingsStore().paramHistoryMax)
  }

  function restoreHistory(fingerprint: string): boolean {
    const hit = paramHistory.value.find((e) => e.fingerprint === fingerprint)
    if (!hit) return false
    applyForm(hit.form)
    return true
  }

  function toggleHistoryStar(fingerprint: string): boolean {
    const before = paramHistory.value
    const max = historyMax()
    const next = toggleStarParamHistory(before, fingerprint, Date.now(), max)
    if (next === before) return false
    paramHistory.value = next
    saveParamHistory(paramHistory.value, max)
    return true
  }

  /** Re-trim local history after settings.paramHistoryMax changes. */
  function applyParamHistoryMax(maxUnstarred?: number): void {
    const max = clampParamHistoryMax(maxUnstarred ?? useSettingsStore().paramHistoryMax)
    paramHistory.value = trimParamHistory(paramHistory.value, max)
    saveParamHistory(paramHistory.value, max)
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
    progress.value = {
      index: 0,
      total: clampBatchSize(form.value.batchSize),
      promptId: '',
      value: 0,
      max: 0,
      node: null,
      phase: 'queued',
    }

    const seedRaw = form.value.seed.trim()
    const seed = seedRaw === '' ? null : Number(seedRaw)
    if (seedRaw !== '' && (!Number.isFinite(seed) || seed! < 0)) {
      status.value = 'error'
      errorMessage.value = 'Seed 必须为空（随机）或非负整数'
      progress.value = null
      throw new Error(errorMessage.value)
    }

    if (form.value.family === 'sdxl' && !form.value.checkpoint.trim()) {
      status.value = 'error'
      errorMessage.value = 'SDXL 模式需要填写 Checkpoint'
      progress.value = null
      throw new Error(errorMessage.value)
    }

    const batchSize = clampBatchSize(form.value.batchSize)
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
      progress.value = null
      throw err
    }

    const historySnapshot = { ...form.value }
    recordParamHistory(historySnapshot)
    const historyFp = formFingerprint(historySnapshot)

    let streamed = 0
    const offImage = window.api.txt2img.onImage((payload) => {
      results.value = [payload.image, ...results.value].slice(0, MAX_RESULTS)
      selectedIndex.value = 0
      lastSeed.value = payload.seed
      lastPromptId.value = payload.promptId
      streamed += 1
      attachHistoryPreviews(historyFp, [payload.image.path])
    })
    const offProgress = window.api.txt2img.onProgress((payload) => {
      progress.value = payload
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
        attachHistoryPreviews(
          historyFp,
          result.images.map((img) => img.path),
        )
      }
      lastSeed.value = result.seed
      lastPromptId.value = result.promptId
      status.value = 'success'

      return result.images.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const cancelled = msg === '已取消生成'
      status.value = cancelled ? 'idle' : 'error'
      errorMessage.value = cancelled ? '' : msg
      throw err
    } finally {
      offImage()
      offProgress()
      progress.value = null
    }
  }

  function recordParamHistory(snapshot: Txt2ImgForm): void {
    const max = historyMax()
    paramHistory.value = pushParamHistory(paramHistory.value, snapshot, Date.now(), max)
    saveParamHistory(paramHistory.value, max)
  }

  function attachHistoryPreviews(fingerprint: string, paths: string[]): void {
    const max = historyMax()
    const next = attachParamHistoryPreviews(paramHistory.value, fingerprint, paths)
    if (next === paramHistory.value) return
    paramHistory.value = next
    saveParamHistory(paramHistory.value, max)
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
    progress.value = null
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
    progress,
    progressLabel,
    progressPercent,
    selectImage,
    applyForm,
    setFamily,
    restoreHistory,
    toggleHistoryStar,
    applyParamHistoryMax,
    generate,
    cancel,
    clearResults,
    setResults,
    prependResults,
  }
})
