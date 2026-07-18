import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform as NodeJS.Platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
    pickOutputDir: () => ipcRenderer.invoke('settings:pickOutputDir'),
    openOutputDir: () => ipcRenderer.invoke('settings:openOutputDir'),
  },
  shell: {
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  },
  comfy: {
    healthCheck: (serverUrl?: string) => ipcRenderer.invoke('comfy:healthCheck', serverUrl),
    listModels: (folder: string) => ipcRenderer.invoke('comfy:listModels', folder),
  },
  comfyProcess: {
    getStatus: () => ipcRenderer.invoke('comfyProcess:getStatus'),
    getLogs: () => ipcRenderer.invoke('comfyProcess:getLogs'),
    clearLogs: () => ipcRenderer.invoke('comfyProcess:clearLogs'),
    start: () => ipcRenderer.invoke('comfyProcess:start'),
    stop: () => ipcRenderer.invoke('comfyProcess:stop'),
    onLog: (cb: (line: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, line: unknown) => cb(line)
      ipcRenderer.on('comfyProcess:log', handler)
      return () => ipcRenderer.removeListener('comfyProcess:log', handler)
    },
    onStatus: (cb: (status: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, status: unknown) => cb(status)
      ipcRenderer.on('comfyProcess:status', handler)
      return () => ipcRenderer.removeListener('comfyProcess:status', handler)
    },
    onCleared: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('comfyProcess:cleared', handler)
      return () => ipcRenderer.removeListener('comfyProcess:cleared', handler)
    },
  },
  txt2img: {
    generate: (params: unknown) => ipcRenderer.invoke('txt2img:generate', params),
    cancel: () => ipcRenderer.invoke('txt2img:cancel'),
    onFormat: (cb: (field: 'prompt' | 'negativePrompt') => void) => {
      const handler = (_e: IpcRendererEvent, field: 'prompt' | 'negativePrompt') => cb(field)
      ipcRenderer.on('txt2img:format', handler)
      return () => ipcRenderer.removeListener('txt2img:format', handler)
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
      ipcRenderer.on('txt2img:image', handler)
      return () => ipcRenderer.removeListener('txt2img:image', handler)
    },
  },
  image: {
    readMetadata: (filePath: string) => ipcRenderer.invoke('image:readMetadata', filePath),
    loadPreviewFromPath: (targetPath: string, limit?: number) =>
      ipcRenderer.invoke('image:loadPreviewFromPath', targetPath, limit),
    onMetadataCopied: (cb: (result: { ok: boolean; message?: string }) => void) => {
      const handler = (_e: IpcRendererEvent, result: { ok: boolean; message?: string }) => cb(result)
      ipcRenderer.on('image:metadata-copied', handler)
      return () => ipcRenderer.removeListener('image:metadata-copied', handler)
    },
  },
  promptPools: {
    list: () => ipcRenderer.invoke('promptPools:list'),
    read: (name: string) => ipcRenderer.invoke('promptPools:read', name),
    write: (pool: unknown) => ipcRenderer.invoke('promptPools:write', pool),
    remove: (name: string) => ipcRenderer.invoke('promptPools:remove', name),
    rename: (oldName: string, newName: string) =>
      ipcRenderer.invoke('promptPools:rename', oldName, newName),
  },
})
