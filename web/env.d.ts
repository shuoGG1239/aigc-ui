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

type ModelFamily = 'anima' | 'sdxl'

interface Txt2ImgParams {
  family: ModelFamily
  prompt: string
  prompts?: string[]
  negativePrompt: string
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
    getPathForFile: (file: File) => string
    settings: {
      get: () => Promise<AppSettings>
      set: (patch: Partial<AppSettings>) => Promise<AppSettings>
      pickOutputDir: () => Promise<string | null>
      openOutputDir: () => Promise<void>
    }
    shell: {
      showItemInFolder: (filePath: string) => Promise<void>
    }
    comfy: {
      healthCheck: (serverUrl?: string) => Promise<HealthResult>
      listModels: (folder: string) => Promise<string[]>
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
      onFormat: (cb: (field: 'prompt' | 'negativePrompt') => void) => () => void
      onImage: (
        cb: (payload: {
          image: GeneratedImage
          seed: number
          index: number
          total: number
          promptId: string
        }) => void,
      ) => () => void
    }
    image: {
      readMetadata: (filePath: string) => Promise<Record<string, unknown>>
      loadPreviewFromPath: (targetPath: string, limit?: number) => Promise<GeneratedImage[]>
      onMetadataCopied: (cb: (result: { ok: boolean; message?: string }) => void) => () => void
    }
    rollWorkflows: {
      list: () => Promise<RollWorkflowDto[]>
      read: (name: string) => Promise<RollWorkflowDto | null>
      write: (wf: RollWorkflowDto) => Promise<RollWorkflowDto>
      remove: (name: string) => Promise<boolean>
      rename: (oldName: string, newName: string) => Promise<RollWorkflowDto>
      importList: (list: unknown[]) => Promise<RollWorkflowDto[]>
    }
  }
}

interface RollWorkflowDto {
  name: string
  entries: Array<{
    tag: string
    weight: number
  }>
  updatedAt: number
}
