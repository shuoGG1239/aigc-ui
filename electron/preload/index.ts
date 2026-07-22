import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { ThemeMode } from '@shared/theme'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform as NodeJS.Platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  theme: {
    set: (mode: ThemeMode) => ipcRenderer.invoke(IPC.theme.set, mode),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.settings.set, patch),
    pickOutputDir: () => ipcRenderer.invoke(IPC.settings.pickOutputDir),
    openOutputDir: () => ipcRenderer.invoke(IPC.settings.openOutputDir),
    pickPromptPreviewDir: () => ipcRenderer.invoke(IPC.settings.pickPromptPreviewDir),
    openPromptPreviewDir: () => ipcRenderer.invoke(IPC.settings.openPromptPreviewDir),
  },
  promptPreview: {
    resolve: (prompt: string) => ipcRenderer.invoke(IPC.promptPreview.resolve, prompt),
    onViewTag: (cb: (prompt: string) => void) => {
      const handler = (_e: IpcRendererEvent, prompt: string) => cb(prompt)
      ipcRenderer.on(IPC.promptPreview.viewTag, handler)
      return () => ipcRenderer.removeListener(IPC.promptPreview.viewTag, handler)
    },
  },
  shell: {
    showItemInFolder: (filePath: string) =>
      ipcRenderer.invoke(IPC.shell.showItemInFolder, filePath),
    openPath: (filePath: string) => ipcRenderer.invoke(IPC.shell.openPath, filePath),
  },
  comfy: {
    healthCheck: (serverUrl?: string) => ipcRenderer.invoke(IPC.comfy.healthCheck, serverUrl),
    listModels: (folder: string) => ipcRenderer.invoke(IPC.comfy.listModels, folder),
  },
  comfyProcess: {
    getStatus: () => ipcRenderer.invoke(IPC.comfyProcess.getStatus),
    getLogs: () => ipcRenderer.invoke(IPC.comfyProcess.getLogs),
    clearLogs: () => ipcRenderer.invoke(IPC.comfyProcess.clearLogs),
    start: () => ipcRenderer.invoke(IPC.comfyProcess.start),
    stop: () => ipcRenderer.invoke(IPC.comfyProcess.stop),
    onLog: (cb: (line: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, line: unknown) => cb(line)
      ipcRenderer.on(IPC.comfyProcess.log, handler)
      return () => ipcRenderer.removeListener(IPC.comfyProcess.log, handler)
    },
    onStatus: (cb: (status: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, status: unknown) => cb(status)
      ipcRenderer.on(IPC.comfyProcess.status, handler)
      return () => ipcRenderer.removeListener(IPC.comfyProcess.status, handler)
    },
    onCleared: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.comfyProcess.cleared, handler)
      return () => ipcRenderer.removeListener(IPC.comfyProcess.cleared, handler)
    },
  },
  txt2img: {
    generate: (params: unknown) => ipcRenderer.invoke(IPC.txt2img.generate, params),
    cancel: () => ipcRenderer.invoke(IPC.txt2img.cancel),
    onFormat: (cb: (field: 'prompt' | 'negativePrompt') => void) => {
      const handler = (_e: IpcRendererEvent, field: 'prompt' | 'negativePrompt') => cb(field)
      ipcRenderer.on(IPC.txt2img.format, handler)
      return () => ipcRenderer.removeListener(IPC.txt2img.format, handler)
    },
    onImage: (
      cb: (payload: {
        image: unknown
        seed: number
        index: number
        total: number
        promptId: string
      }) => void,
    ) => {
      const handler = (
        _e: IpcRendererEvent,
        payload: {
          image: unknown
          seed: number
          index: number
          total: number
          promptId: string
        },
      ) => cb(payload)
      ipcRenderer.on(IPC.txt2img.image, handler)
      return () => ipcRenderer.removeListener(IPC.txt2img.image, handler)
    },
    onProgress: (cb: (payload: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
      ipcRenderer.on(IPC.txt2img.progress, handler)
      return () => ipcRenderer.removeListener(IPC.txt2img.progress, handler)
    },
  },
  image: {
    readMetadata: (filePath: string) => ipcRenderer.invoke(IPC.image.readMetadata, filePath),
    readClipboardMetadata: () => ipcRenderer.invoke(IPC.image.readClipboardMetadata),
    loadPreviewFromPath: (targetPath: string, limit?: number) =>
      ipcRenderer.invoke(IPC.image.loadPreviewFromPath, targetPath, limit),
    onMetadataCopied: (cb: (result: { ok: boolean; message?: string }) => void) => {
      const handler = (_e: IpcRendererEvent, result: { ok: boolean; message?: string }) => cb(result)
      ipcRenderer.on(IPC.image.metadataCopied, handler)
      return () => ipcRenderer.removeListener(IPC.image.metadataCopied, handler)
    },
  },
  promptPools: {
    list: () => ipcRenderer.invoke(IPC.promptPools.list),
    write: (pool: {
      name: string
      entries: Array<{ prompt: string; weight: number }>
      updatedAt: number
      builtin?: boolean
    }) => ipcRenderer.invoke(IPC.promptPools.write, pool),
    remove: (name: string) => ipcRenderer.invoke(IPC.promptPools.remove, name),
    rename: (oldName: string, newName: string) =>
      ipcRenderer.invoke(IPC.promptPools.rename, oldName, newName),
  },
  find: {
    start: (
      text: string,
      opts?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
    ) => ipcRenderer.invoke(IPC.find.start, text, opts),
    stop: () => ipcRenderer.invoke(IPC.find.stop),
    close: () => ipcRenderer.invoke(IPC.find.close),
    onFound: (
      cb: (result: {
        requestId: number
        activeMatchOrdinal: number
        matches: number
        finalUpdate: boolean
      }) => void,
    ) => {
      const handler = (
        _e: IpcRendererEvent,
        result: {
          requestId: number
          activeMatchOrdinal: number
          matches: number
          finalUpdate: boolean
        },
      ) => cb(result)
      ipcRenderer.on(IPC.find.found, handler)
      return () => ipcRenderer.removeListener(IPC.find.found, handler)
    },
    onActivate: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.find.activate, handler)
      return () => ipcRenderer.removeListener(IPC.find.activate, handler)
    },
    onDeactivate: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.find.deactivate, handler)
      return () => ipcRenderer.removeListener(IPC.find.deactivate, handler)
    },
    onTheme: (cb: (mode: ThemeMode) => void) => {
      const handler = (_e: IpcRendererEvent, mode: ThemeMode) => cb(mode)
      ipcRenderer.on(IPC.find.setTheme, handler)
      return () => ipcRenderer.removeListener(IPC.find.setTheme, handler)
    },
  },
})
