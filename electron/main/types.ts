export interface AppSettings {
  serverUrl: string
  outputDir: string
  /** 一行启动命令（可含 cd && …） */
  launchCommand: string
}

export interface ComfyProcessStatus {
  running: boolean
  pid: number | null
}

export type ModelFamily = 'anima' | 'sdxl'

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
