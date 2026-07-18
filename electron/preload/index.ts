import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform as NodeJS.Platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
    pickOutputDir: () => ipcRenderer.invoke('settings:pickOutputDir'),
    openOutputDir: () => ipcRenderer.invoke('settings:openOutputDir'),
  },
  comfy: {
    healthCheck: (serverUrl?: string) => ipcRenderer.invoke('comfy:healthCheck', serverUrl),
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
  },
})
