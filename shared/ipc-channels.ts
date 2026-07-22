/**
 * Shared IPC channel names (main ↔ preload).
 * Keep string values stable; rename keys freely.
 */
export const IPC = {
  theme: {
    set: 'theme:set',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    pickOutputDir: 'settings:pickOutputDir',
    openOutputDir: 'settings:openOutputDir',
    pickPromptPreviewDir: 'settings:pickPromptPreviewDir',
    openPromptPreviewDir: 'settings:openPromptPreviewDir',
  },
  promptPreview: {
    resolve: 'promptPreview:resolve',
    viewTag: 'promptPreview:view-tag',
  },
  promptPools: {
    list: 'promptPools:list',
    write: 'promptPools:write',
    remove: 'promptPools:remove',
    rename: 'promptPools:rename',
  },
  shell: {
    showItemInFolder: 'shell:showItemInFolder',
    openPath: 'shell:openPath',
  },
  comfy: {
    healthCheck: 'comfy:healthCheck',
    listModels: 'comfy:listModels',
  },
  comfyProcess: {
    getStatus: 'comfyProcess:getStatus',
    getLogs: 'comfyProcess:getLogs',
    clearLogs: 'comfyProcess:clearLogs',
    start: 'comfyProcess:start',
    stop: 'comfyProcess:stop',
    log: 'comfyProcess:log',
    status: 'comfyProcess:status',
    cleared: 'comfyProcess:cleared',
  },
  txt2img: {
    generate: 'txt2img:generate',
    cancel: 'txt2img:cancel',
    format: 'txt2img:format',
    image: 'txt2img:image',
    progress: 'txt2img:progress',
  },
  image: {
    readMetadata: 'image:readMetadata',
    readClipboardMetadata: 'image:readClipboardMetadata',
    loadPreviewFromPath: 'image:loadPreviewFromPath',
    metadataCopied: 'image:metadata-copied',
  },
  find: {
    start: 'find:start',
    stop: 'find:stop',
    close: 'find:close',
    found: 'find:found',
    activate: 'find:activate',
    deactivate: 'find:deactivate',
    setTheme: 'find:setTheme',
  },
} as const
