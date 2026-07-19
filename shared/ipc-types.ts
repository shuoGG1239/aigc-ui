import type { ModelFamily } from './family'

/** Persisted app settings (renderer ↔ main). */
export interface AppSettings {
  serverUrl: string
  outputDir: string
  /** One-line launch command (may include `cd && …`). */
  launchCommand: string
  /** Directory of prompt preview images (filename stem ↔ normalized prompt). */
  promptPreviewDir: string
}

export interface ComfyProcessStatus {
  running: boolean
  pid: number | null
}

export interface ComfyLogLine {
  id: number
  ts: number
  level: 'info' | 'stdout' | 'stderr' | 'system'
  text: string
}

/** Resolved LoRA for workflow injection (filled by main after parsing tags). */
export interface ResolvedLora {
  name: string
  fileName: string
  strengthModel: number
  strengthClip: number
}

/** Generate IPC payload from renderer → main. */
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

/** Live generate progress from ComfyUI WebSocket (`/ws`). */
export interface GenerateProgress {
  /** 0-based index within the current batch. */
  index: number
  total: number
  promptId: string
  /** Sampler / node step (from `progress`); 0 when unknown. */
  value: number
  max: number
  /** Current Comfy node id, or null when idle / finished. */
  node: string | null
  phase: 'queued' | 'running' | 'done'
}

export interface HealthResult {
  ok: boolean
  message: string
}

export interface PromptPreviewImage {
  path: string
  dataUrl: string
  filename: string
}

export type PromptPreviewResolveResult =
  | { ok: true; images: PromptPreviewImage[] }
  | { ok: false; reason: 'no_dir' | 'not_found' }
