import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { basename, dirname, extname, join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { ComfyUIClient } from './comfyui'
import { readClipboardPngMetadata } from './clipboard-png'
import { extractPngInfo } from './png-info'
import { getSettings, setSettings, defaultOutputDir, defaultPromptPreviewDir } from './settings'
import { resolvePromptPreview } from './prompt-preview'
import {
  clearLogs,
  getLogs,
  getStatus,
  startComfy,
  stopComfy,
} from './comfy-process'
import type { AppSettings, FindInPageOptions, Txt2ImgParams } from './types'
import {
  listPromptPools,
  removePromptPool,
  renamePromptPool,
  writePromptPool,
  type PromptPoolFile,
} from './prompt-pools'
import { generateTxt2Img, type ActiveClientHolder } from './txt2img-generate'
import type { FindBarHost } from './find-bar'
import { IPC } from '@shared/ipc-channels'
import { chromeForTheme, isThemeMode, type ThemeMode } from '@shared/theme'

function applyWindowChrome(win: BrowserWindow, theme: ThemeMode): void {
  const { bg, fg } = chromeForTheme(theme)
  win.setBackgroundColor(bg)
  if (process.platform === 'win32') {
    try {
      win.setTitleBarOverlay({
        color: bg,
        symbolColor: fg,
        height: 36,
      })
    } catch {
      // overlay unsupported / not enabled
    }
  }
}

export function registerIpc(opts: {
  getMainWindow: () => BrowserWindow | null
  activeClient: ActiveClientHolder
  findBar: FindBarHost
}): void {
  const { getMainWindow, activeClient, findBar } = opts

  ipcMain.handle(IPC.theme.set, (_event, theme: unknown) => {
    const mode: ThemeMode = isThemeMode(theme) ? theme : 'light'
    const win = getMainWindow()
    if (win) applyWindowChrome(win, mode)
    findBar.setTheme(mode)
    return mode
  })

  ipcMain.handle(IPC.settings.get, () => getSettings())

  ipcMain.handle(IPC.settings.set, (_event, patch: Partial<AppSettings>) => {
    return setSettings(patch)
  })

  ipcMain.handle(IPC.settings.pickOutputDir, async () => {
    const win = getMainWindow()
    if (!win) return null
    const current = getSettings().outputDir || defaultOutputDir()
    const result = await dialog.showOpenDialog(win, {
      title: '选择输出目录',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    return setSettings({ outputDir: result.filePaths[0] }).outputDir
  })

  ipcMain.handle(IPC.settings.openOutputDir, async () => {
    const dir = getSettings().outputDir || defaultOutputDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const err = await shell.openPath(dir)
    if (err) {
      throw new Error(err)
    }
  })

  ipcMain.handle(IPC.settings.pickPromptPreviewDir, async () => {
    const win = getMainWindow()
    if (!win) return null
    const current = getSettings().promptPreviewDir || defaultPromptPreviewDir() || undefined
    const result = await dialog.showOpenDialog(win, {
      title: '选择提示词预览图目录',
      defaultPath: current,
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    return setSettings({ promptPreviewDir: result.filePaths[0] }).promptPreviewDir
  })

  ipcMain.handle(IPC.settings.openPromptPreviewDir, async () => {
    const dir = getSettings().promptPreviewDir?.trim()
    if (!dir) {
      throw new Error('未配置预览图目录')
    }
    if (!existsSync(dir)) {
      throw new Error('预览图目录不存在')
    }
    const err = await shell.openPath(dir)
    if (err) {
      throw new Error(err)
    }
  })

  ipcMain.handle(IPC.promptPreview.resolve, (_event, prompt: string) => resolvePromptPreview(prompt))

  ipcMain.handle(IPC.promptPools.list, () => listPromptPools())
  ipcMain.handle(IPC.promptPools.write, (_event, pool: PromptPoolFile) => writePromptPool(pool))
  ipcMain.handle(IPC.promptPools.remove, (_event, name: string) => removePromptPool(name))
  ipcMain.handle(IPC.promptPools.rename, (_event, oldName: string, newName: string) =>
    renamePromptPool(oldName, newName),
  )

  ipcMain.handle(IPC.image.readMetadata, async (_event, filePath: string) => {
    const target = filePath?.trim()
    if (!target) {
      throw new Error('路径为空')
    }
    if (!existsSync(target)) {
      throw new Error('文件不存在')
    }
    return extractPngInfo(readFileSync(target))
  })

  ipcMain.handle(IPC.image.readClipboardMetadata, () => readClipboardPngMetadata())

  ipcMain.handle(IPC.image.loadPreviewFromPath, async (_event, targetPath: string, limit = 10) => {
    const target = targetPath?.trim()
    if (!target) {
      throw new Error('路径为空')
    }
    if (!existsSync(target)) {
      throw new Error('路径不存在')
    }

    const st = statSync(target)
    const toImage = (path: string, filename: string) => ({
      path,
      filename: filename || basename(path),
      dataUrl: `data:image/png;base64,${readFileSync(path).toString('base64')}`,
    })

    if (st.isFile()) {
      if (extname(target).toLowerCase() !== '.png') {
        throw new Error('仅支持 PNG 图片或包含 PNG 的文件夹')
      }
      return [toImage(target, basename(target))]
    }

    if (!st.isDirectory()) {
      throw new Error('请拖入 PNG 图片或文件夹')
    }

    const max = Math.max(1, Math.min(Math.floor(limit) || 10, 24))
    const entries = readdirSync(target)
      .filter((name) => extname(name).toLowerCase() === '.png')
      .map((name) => {
        const path = join(target, name)
        const fileSt = statSync(path)
        return { path, filename: name, mtime: fileSt.mtimeMs, isFile: fileSt.isFile() }
      })
      .filter((e) => e.isFile)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, max)

    if (!entries.length) {
      throw new Error('文件夹内没有 PNG 图片')
    }

    return entries.map(({ path, filename }) => toImage(path, filename))
  })

  ipcMain.handle(IPC.shell.showItemInFolder, async (_event, filePath: string) => {
    const target = filePath?.trim()
    if (!target) {
      throw new Error('路径为空')
    }
    if (existsSync(target)) {
      shell.showItemInFolder(target)
      return
    }
    const dir = dirname(target)
    if (existsSync(dir)) {
      const err = await shell.openPath(dir)
      if (err) throw new Error(err)
      return
    }
    throw new Error('文件或目录不存在')
  })

  ipcMain.handle(IPC.comfy.healthCheck, async (_event, serverUrl?: string) => {
    const url = (serverUrl?.trim() || getSettings().serverUrl).replace(/\/$/, '')
    const client = new ComfyUIClient(url)
    return client.healthCheck()
  })

  ipcMain.handle(IPC.comfy.listModels, async (_event, folder: string) => {
    const url = getSettings().serverUrl.replace(/\/$/, '')
    const client = new ComfyUIClient(url)
    return client.listModels(folder)
  })

  ipcMain.handle(IPC.comfyProcess.getStatus, () => getStatus())
  ipcMain.handle(IPC.comfyProcess.getLogs, () => getLogs())
  ipcMain.handle(IPC.comfyProcess.clearLogs, () => {
    clearLogs()
  })

  ipcMain.handle(IPC.comfyProcess.start, async () => {
    return startComfy(getSettings())
  })

  ipcMain.handle(IPC.comfyProcess.stop, async () => {
    return stopComfy()
  })

  ipcMain.handle(IPC.txt2img.cancel, () => {
    activeClient.client?.cancel()
  })

  ipcMain.handle(IPC.txt2img.generate, async (event, params: Txt2ImgParams) => {
    return generateTxt2Img(event, params, activeClient)
  })

  // Always search the main page — never the find-bar WebContentsView.
  ipcMain.handle(IPC.find.start, (_event, text: string, opts?: FindInPageOptions) => {
    return findBar.findInPage(text, opts)
  })

  ipcMain.handle(IPC.find.stop, () => {
    findBar.stopFind()
  })

  ipcMain.handle(IPC.find.close, () => {
    findBar.close()
  })
}
