export interface AppSettings {
  serverUrl: string
  outputDir: string
  /** 一行启动命令（可含 cd && …） */
  launchCommand: string
  /** Directory of prompt preview images (filename stem ↔ normalized prompt). */
  promptPreviewDir: string
}

export interface ComfyProcessStatus {
  running: boolean
  pid: number | null
}

export type ModelFamily = 'anima' | 'sdxl'

/** Resolved LoRA for workflow injection (main process only). */
export interface ResolvedLora {
  name: string
  fileName: string
  strengthModel: number
  strengthClip: number
}

export interface Txt2ImgParams {
  family: ModelFamily
  prompt: string
  /** Per-image prompts (batch iterator). Falls back to `prompt` when missing. */
  prompts?: string[]
  negativePrompt: string
  /** Per-image negatives (batch iterator). Falls back to `negativePrompt` when missing. */
  negativePrompts?: string[]
  width: number
  height: number
  batchSize: number
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  seed: number | null
  unetModel: string
  clipModel: string
  clipType: string
  vaeModel: string
  unetWeightDtype: string
  auraflowShift: number
  checkpoint: string
  outputPrefix: string
  /**
   * A1111-style Clip skip. 1 = default CLIP; 2 → CLIPSetLastLayer(-2).
   * Injected into workflow after LoRA chain, before CLIPTextEncode.
   */
  clipSkip?: number
  /** Injected by main process after parsing `<lora:>` tags. */
  loras?: ResolvedLora[]
}

export interface GeneratedImage {
  path: string
  dataUrl: string
  filename: string
}

export interface GenerateResult {
  promptId: string
  seed: number
  seeds: number[]
  images: GeneratedImage[]
}

export interface HealthResult {
  ok: boolean
  message: string
}
