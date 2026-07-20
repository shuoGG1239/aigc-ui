import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_SERVER_URL } from '@shared/app-defaults'
import { clampParamHistoryMax, PARAM_HISTORY_MAX_DEFAULT } from '@shared/limits'
import type { AppSettings } from './types'
const DEFAULT_COMFY_ROOT = 'C:\\c_git_project\\ComfyUI-aki-v2'

const DEFAULT_LAUNCH_COMMAND =
  `cd /d "${DEFAULT_COMFY_ROOT}" && "${join(DEFAULT_COMFY_ROOT, 'python', 'python.exe')}" "${join(DEFAULT_COMFY_ROOT, 'ComfyUI', 'main.py')}" --fast`

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function defaultOutputDir(): string {
  const dir = join(app.getPath('userData'), 'output')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Prefer Desktop/artists when present (common local preview library). */
export function defaultPromptPreviewDir(): string {
  const desktop = join(homedir(), 'Desktop', 'artists')
  if (existsSync(desktop)) return desktop
  return ''
}

export function getSettings(): AppSettings {
  const defaults: AppSettings = {
    serverUrl: DEFAULT_SERVER_URL,
    outputDir: defaultOutputDir(),
    launchCommand: DEFAULT_LAUNCH_COMMAND,
    promptPreviewDir: defaultPromptPreviewDir(),
    paramHistoryMax: PARAM_HISTORY_MAX_DEFAULT,
  }

  try {
    const path = settingsPath()
    if (!existsSync(path)) {
      return defaults
    }
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    return {
      serverUrl:
        typeof raw.serverUrl === 'string' && raw.serverUrl.trim()
          ? raw.serverUrl.trim()
          : defaults.serverUrl,
      outputDir:
        typeof raw.outputDir === 'string' && raw.outputDir.trim()
          ? raw.outputDir.trim()
          : defaults.outputDir,
      launchCommand:
        typeof raw.launchCommand === 'string' && raw.launchCommand.trim()
          ? raw.launchCommand.trim()
          : defaults.launchCommand,
      promptPreviewDir:
        typeof raw.promptPreviewDir === 'string'
          ? raw.promptPreviewDir.trim()
          : defaults.promptPreviewDir,
      paramHistoryMax: clampParamHistoryMax(raw.paramHistoryMax, defaults.paramHistoryMax),
    }
  } catch {
    return defaults
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  if (next.serverUrl) {
    next.serverUrl = next.serverUrl.replace(/\/$/, '')
  }
  if (next.outputDir && !existsSync(next.outputDir)) {
    mkdirSync(next.outputDir, { recursive: true })
  }
  if (next.launchCommand) {
    next.launchCommand = next.launchCommand.trim()
  }
  if (typeof next.promptPreviewDir === 'string') {
    next.promptPreviewDir = next.promptPreviewDir.trim()
  }
  next.paramHistoryMax = clampParamHistoryMax(next.paramHistoryMax)
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
