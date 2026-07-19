/// <reference types="vite/client" />

import type {
  AppSettings,
  ComfyLogLine,
  ComfyProcessStatus,
  GenerateResult,
  GeneratedImage,
  HealthResult,
  PromptPreviewResolveResult,
  Txt2ImgParams,
} from '../shared/ipc-types'
import type { PromptPool } from '../shared/prompt-pool-types'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.csv?raw' {
  const content: string
  export default content
}

declare global {
  interface Window {
    api: {
      platform:
        | 'aix'
        | 'android'
        | 'darwin'
        | 'freebsd'
        | 'haiku'
        | 'linux'
        | 'openbsd'
        | 'sunos'
        | 'win32'
        | 'cygwin'
        | 'netbsd'
      getPathForFile: (file: File) => string
      settings: {
        get: () => Promise<AppSettings>
        set: (patch: Partial<AppSettings>) => Promise<AppSettings>
        pickOutputDir: () => Promise<string | null>
        openOutputDir: () => Promise<void>
        pickPromptPreviewDir: () => Promise<string | null>
        openPromptPreviewDir: () => Promise<void>
      }
      promptPreview: {
        resolve: (prompt: string) => Promise<PromptPreviewResolveResult>
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
      promptPools: {
        list: () => Promise<PromptPool[]>
        write: (pool: PromptPool) => Promise<PromptPool>
        remove: (name: string) => Promise<boolean>
        rename: (oldName: string, newName: string) => Promise<PromptPool>
      }
    }
  }
}

export {}
