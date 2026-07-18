import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { basename, dirname, extname, join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { ComfyUIClient } from './comfyui'
import { extractPngInfo } from './png-info'
import { getSettings, setSettings, defaultOutputDir } from './settings'
import { buildWorkflow } from './workflow'
import {
  clearLogs,
  getLogs,
  getStatus,
  initComfyProcess,
  startComfy,
  stopComfy,
  stopComfySync,
} from './comfy-process'
import type { AppSettings, GenerateResult, Txt2ImgParams } from './types'
import {
  listPromptPools,
  readPromptPool,
  removePromptPool,
  renamePromptPool,
  writePromptPool,
  type PromptPoolFile,
} from './prompt-pools'

let mainWindow: BrowserWindow | null = null
let activeClient: ComfyUIClient | null = null

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'AIGC UI',
    backgroundColor: '#f4f7fc',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 10 } }
      : {
          titleBarOverlay: {
            color: '#f4f7fc',
            symbolColor: '#475569',
            height: 36,
          },
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // 右键菜单：编辑项 / 格式化 Prompt / 复制元数据 / 检查
  mainWindow.webContents.on('context-menu', async (_event, params) => {
    const win = mainWindow
    if (!win) return

    let promptField: 'prompt' | 'negativePrompt' | null = null
    let imagePath: string | null = null
    try {
      const hit = (await win.webContents.executeJavaScript(
        `(() => {
          const at = document.elementFromPoint(${params.x}, ${params.y});
          const img = at && typeof at.closest === 'function'
            ? at.closest('img[data-image-path]')
            : null;
          const imagePath = img && typeof img.getAttribute === 'function'
            ? img.getAttribute('data-image-path')
            : null;
          const el = document.activeElement;
          let promptField = null;
          if (el && typeof el.getAttribute === 'function') {
            const attr = el.getAttribute('data-prompt-field');
            if (attr === 'prompt' || attr === 'negativePrompt') promptField = attr;
          }
          return { imagePath, promptField };
        })()`,
      )) as { imagePath?: string | null; promptField?: string | null }
      if (hit?.promptField === 'prompt' || hit?.promptField === 'negativePrompt') {
        promptField = hit.promptField
      }
      if (typeof hit?.imagePath === 'string' && hit.imagePath.trim()) {
        imagePath = hit.imagePath
      }
    } catch {
      // ignore
    }

    const template: Electron.MenuItemConstructorOptions[] = []

    if (params.isEditable || (params.selectionText && params.selectionText.length > 0)) {
      template.push(
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
      )
    }

    if (promptField) {
      template.push({
        label: '格式化',
        click: () => {
          win.webContents.send('txt2img:format', promptField)
        },
      })
    }

    if (imagePath) {
      const pathForCopy = imagePath
      template.push({
        label: '复制元数据',
        click: () => {
          try {
            const buf = readFileSync(pathForCopy)
            const info = extractPngInfo(buf)
            clipboard.writeText(JSON.stringify(info))
            win.webContents.send('image:metadata-copied', { ok: true })
          } catch (err) {
            win.webContents.send('image:metadata-copied', {
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            })
          }
        },
      })
    }

    template.push({
      label: '检查',
      click: () => {
        win.webContents.inspectElement(params.x, params.y)
      },
    })

    Menu.buildFromTemplate(template).popup({ window: win })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })


  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>) => {
    return setSettings(patch)
  })

  ipcMain.handle('settings:pickOutputDir', async () => {
    const current = getSettings().outputDir || defaultOutputDir()
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择输出目录',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    return setSettings({ outputDir: result.filePaths[0] }).outputDir
  })

  ipcMain.handle('settings:openOutputDir', async () => {
    const dir = getSettings().outputDir || defaultOutputDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const err = await shell.openPath(dir)
    if (err) {
      throw new Error(err)
    }
  })

  ipcMain.handle('promptPools:list', () => listPromptPools())
  ipcMain.handle('promptPools:read', (_event, name: string) => readPromptPool(name))
  ipcMain.handle('promptPools:write', (_event, pool: PromptPoolFile) => writePromptPool(pool))
  ipcMain.handle('promptPools:remove', (_event, name: string) => removePromptPool(name))
  ipcMain.handle('promptPools:rename', (_event, oldName: string, newName: string) =>
    renamePromptPool(oldName, newName),
  )

  ipcMain.handle('image:readMetadata', async (_event, filePath: string) => {
    const target = filePath?.trim()
    if (!target) {
      throw new Error('路径为空')
    }
    if (!existsSync(target)) {
      throw new Error('文件不存在')
    }
    return extractPngInfo(readFileSync(target))
  })

  ipcMain.handle('image:loadPreviewFromPath', async (_event, targetPath: string, limit = 5) => {
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

    const max = Math.max(1, Math.min(Math.floor(limit) || 5, 24))
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

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
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

  ipcMain.handle('comfy:healthCheck', async (_event, serverUrl?: string) => {
    const url = (serverUrl?.trim() || getSettings().serverUrl).replace(/\/$/, '')
    const client = new ComfyUIClient(url)
    return client.healthCheck()
  })

  ipcMain.handle('comfy:listModels', async (_event, folder: string) => {
    const url = getSettings().serverUrl.replace(/\/$/, '')
    const client = new ComfyUIClient(url)
    return client.listModels(folder)
  })

  ipcMain.handle('comfyProcess:getStatus', () => getStatus())
  ipcMain.handle('comfyProcess:getLogs', () => getLogs())
  ipcMain.handle('comfyProcess:clearLogs', () => {
    clearLogs()
  })

  ipcMain.handle('comfyProcess:start', async () => {
    return startComfy(getSettings())
  })

  ipcMain.handle('comfyProcess:stop', async () => {
    return stopComfy()
  })

  ipcMain.handle('txt2img:cancel', () => {
    activeClient?.cancel()
  })

  ipcMain.handle('txt2img:generate', async (event, params: Txt2ImgParams): Promise<GenerateResult> => {
    const settings = getSettings()
    const client = new ComfyUIClient(settings.serverUrl)
    activeClient = client
    client.resetCancel()

    try {
      const health = await client.healthCheck()
      if (!health.ok) {
        throw new Error(health.message)
      }

      const count = Math.max(1, Math.min(Math.floor(params.batchSize || 1), 64))
      const outputDir = settings.outputDir || defaultOutputDir()
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const ts = Math.floor(Date.now() / 1000)
      const prefix =
        params.outputPrefix || (params.family === 'sdxl' ? 'sdxl' : 'anima')
      const images: GenerateResult['images'] = []
      const seeds: number[] = []
      let lastPromptId = ''

      for (let i = 0; i < count; i++) {
        const seedForRun =
          params.seed !== null && params.seed !== undefined
            ? params.seed + i
            : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

        const promptForRun =
          Array.isArray(params.prompts) && params.prompts[i] !== undefined
            ? params.prompts[i]
            : params.prompt
        const negativeForRun =
          Array.isArray(params.negativePrompts) && params.negativePrompts[i] !== undefined
            ? params.negativePrompts[i]
            : params.negativePrompt
        const { workflow, seed } = buildWorkflow(
          { ...params, prompt: promptForRun, negativePrompt: negativeForRun },
          seedForRun,
        )
        const promptId = await client.queuePrompt(workflow)
        lastPromptId = promptId
        const historyEntry = await client.waitForCompletion(promptId)
        const remoteImages = client.extractOutputImages(historyEntry)

        if (!remoteImages.length) {
          throw new Error(`第 ${i + 1}/${count} 张生成完成但未找到输出图片，请检查 ComfyUI 日志。`)
        }

        const img = remoteImages[0]
        const data = await client.downloadImage(img.filename, img.subfolder, img.type)
        const suffix = extname(img.filename) || '.png'
        const filename = count === 1 ? `${prefix}_${ts}${suffix}` : `${prefix}_${ts}_${i}${suffix}`
        const path = join(outputDir, filename)
        writeFileSync(path, data)

        const mime =
          suffix.toLowerCase() === '.jpg' || suffix.toLowerCase() === '.jpeg' ? 'image/jpeg' : 'image/png'
        const image = {
          path,
          filename,
          dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        }
        images.push(image)
        seeds.push(seed)
        event.sender.send('txt2img:image', {
          image,
          seed,
          index: i,
          total: count,
          promptId,
        })
      }

      return { promptId: lastPromptId, seed: seeds[0], seeds, images }
    } finally {
      activeClient = null
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aigc.ui')
  }

  initComfyProcess(() => mainWindow)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  // 同步杀掉控制台拉起的进程树，避免 async 未完成应用已退出
  stopComfySync()
})

app.on('window-all-closed', () => {
  stopComfySync()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

