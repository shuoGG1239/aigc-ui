import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from './types'

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8188'
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

function migrateLaunchCommand(raw: Record<string, unknown>): string {
  if (typeof raw.launchCommand === 'string' && raw.launchCommand.trim()) {
    return raw.launchCommand
      .replace(/(^|\s)--auto-launch(\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // 兼容旧版：工作目录 + python/main/args
  const comfyRoot =
    typeof raw.comfyRoot === 'string' && raw.comfyRoot.trim()
      ? raw.comfyRoot.trim()
      : DEFAULT_COMFY_ROOT
  const pythonPath =
    typeof raw.pythonPath === 'string' && raw.pythonPath.trim()
      ? raw.pythonPath.trim()
      : join(comfyRoot, 'python', 'python.exe')
  const mainPy =
    typeof raw.mainPy === 'string' && raw.mainPy.trim()
      ? raw.mainPy.trim()
      : join(comfyRoot, 'ComfyUI', 'main.py')
  const launchArgs =
    typeof raw.launchArgs === 'string' && raw.launchArgs.trim()
      ? raw.launchArgs
          .trim()
          .replace(/(^|\s)--auto-launch(\s|$)/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '--fast'

  if (raw.comfyRoot || raw.pythonPath || raw.mainPy || raw.launchArgs) {
    return `cd /d "${comfyRoot}" && "${pythonPath}" "${mainPy}" ${launchArgs}`.trim()
  }

  return DEFAULT_LAUNCH_COMMAND
}

export function getSettings(): AppSettings {
  const defaults: AppSettings = {
    serverUrl: DEFAULT_SERVER_URL,
    outputDir: defaultOutputDir(),
    launchCommand: DEFAULT_LAUNCH_COMMAND,
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
      launchCommand: migrateLaunchCommand(raw),
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
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
