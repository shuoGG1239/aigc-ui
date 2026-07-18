import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { ComfyUIClient } from './comfyui'
import { getSettings, setSettings, defaultOutputDir } from './settings'
import { buildAnimaWorkflow } from './workflow'
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

  // 右键「检查」：打开开发者工具并定位到该元素（类似 Chrome）
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const win = mainWindow
    if (!win) return

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '检查',
        click: () => {
          // 打开 DevTools 并选中坐标处元素
          win.webContents.inspectElement(params.x, params.y)
        },
      },
    ]

    if (params.isEditable || (params.selectionText && params.selectionText.length > 0)) {
      template.unshift(
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
      )
    }

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

  ipcMain.handle('comfy:healthCheck', async (_event, serverUrl?: string) => {
    const url = (serverUrl?.trim() || getSettings().serverUrl).replace(/\/$/, '')
    const client = new ComfyUIClient(url)
    return client.healthCheck()
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

  ipcMain.handle('txt2img:generate', async (_event, params: Txt2ImgParams): Promise<GenerateResult> => {
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
      const prefix = params.outputPrefix || 'anima'
      const images: GenerateResult['images'] = []
      const seeds: number[] = []
      let lastPromptId = ''

      for (let i = 0; i < count; i++) {
        const seedForRun =
          params.seed !== null && params.seed !== undefined
            ? params.seed + i
            : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

        const { workflow, seed } = buildAnimaWorkflow(params, seedForRun)
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
        images.push({
          path,
          filename,
          dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        })
        seeds.push(seed)
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

