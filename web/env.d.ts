/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface AppSettings {
  serverUrl: string
  outputDir: string
  launchCommand: string
}

interface Txt2ImgParams {
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
  seed: number | null
  unetModel: string
  clipModel: string
  clipType: string
  vaeModel: string
  unetWeightDtype: string
  auraflowShift: number
  outputPrefix: string
}

interface GeneratedImage {
  path: string
  dataUrl: string
  filename: string
}

interface GenerateResult {
  promptId: string
  seed: number
  seeds: number[]
  images: GeneratedImage[]
}

interface HealthResult {
  ok: boolean
  message: string
}

interface ComfyProcessStatus {
  running: boolean
  pid: number | null
}

interface ComfyLogLine {
  id: number
  ts: number
  level: 'info' | 'stdout' | 'stderr' | 'system'
  text: string
}

interface Window {
  api: {
    platform: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
    settings: {
      get: () => Promise<AppSettings>
      set: (patch: Partial<AppSettings>) => Promise<AppSettings>
      pickOutputDir: () => Promise<string | null>
      openOutputDir: () => Promise<void>
    }
    comfy: {
      healthCheck: (serverUrl?: string) => Promise<HealthResult>
    }
    comfyProcess: {
      getStatus: () => Promise<ComfyProcessStatus>
      getLogs: () => Promise<ComfyLogLine[]>
      clearLogs: () => Promise<void>
      start: () => Promise<ComfyProcessStatus>
      stop: () => Promise<ComfyProcessStatus>
      onLog: (cb: (line: ComfyLogLine) => void) => () => void
      onStatus: (cb: (status: ComfyProcessStatus) => void) => () => void
      onCleared: (cb: () => void) => () => void
    }
    txt2img: {
      generate: (params: Txt2ImgParams) => Promise<GenerateResult>
      cancel: () => Promise<void>
    }
  }
}
