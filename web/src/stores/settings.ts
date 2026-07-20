import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SERVER_URL } from '@shared/app-defaults'
import type { AppSettings } from '@shared/ipc-types'
import { PARAM_HISTORY_MAX_DEFAULT } from '@shared/limits'

export type ConnStatus = 'unknown' | 'checking' | 'ok' | 'bad'

export const useSettingsStore = defineStore('settings', () => {
  const serverUrl = ref(DEFAULT_SERVER_URL)
  const outputDir = ref('')
  const launchCommand = ref('')
  const promptPreviewDir = ref('')
  const paramHistoryMax = ref(PARAM_HISTORY_MAX_DEFAULT)
  const connStatus = ref<ConnStatus>('unknown')
  const connMessage = ref('')
  const loaded = ref(false)

  function apply(s: AppSettings): void {
    serverUrl.value = s.serverUrl
    outputDir.value = s.outputDir
    launchCommand.value = s.launchCommand
    promptPreviewDir.value = s.promptPreviewDir || ''
    paramHistoryMax.value = s.paramHistoryMax
  }

  async function load(): Promise<void> {
    const s = await window.api.settings.get()
    apply(s)
    loaded.value = true
  }

  async function save(patch: Partial<AppSettings>): Promise<void> {
    const s = await window.api.settings.set(patch)
    apply(s)
  }

  async function pickOutputDir(): Promise<void> {
    const dir = await window.api.settings.pickOutputDir()
    if (dir) {
      outputDir.value = dir
    }
  }

  async function openOutputDir(): Promise<void> {
    await window.api.settings.openOutputDir()
  }

  async function pickPromptPreviewDir(): Promise<void> {
    const dir = await window.api.settings.pickPromptPreviewDir()
    if (dir) {
      promptPreviewDir.value = dir
    }
  }

  async function openPromptPreviewDir(): Promise<void> {
    await window.api.settings.openPromptPreviewDir()
  }

  async function healthCheck(url?: string): Promise<boolean> {
    connStatus.value = 'checking'
    const result = await window.api.comfy.healthCheck(url ?? serverUrl.value)
    connStatus.value = result.ok ? 'ok' : 'bad'
    connMessage.value = result.message
    return result.ok
  }

  return {
    serverUrl,
    outputDir,
    launchCommand,
    promptPreviewDir,
    paramHistoryMax,
    connStatus,
    connMessage,
    loaded,
    load,
    save,
    pickOutputDir,
    openOutputDir,
    pickPromptPreviewDir,
    openPromptPreviewDir,
    healthCheck,
  }
})
