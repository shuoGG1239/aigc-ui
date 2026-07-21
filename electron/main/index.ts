import { app, BrowserWindow, clipboard, Menu, shell } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { extractPngInfo } from './png-info'
import { initComfyProcess, stopComfySync } from './comfy-process'
import { APP_DISPLAY_NAME } from '@shared/app-defaults'
import { IPC } from '@shared/ipc-channels'
import { THEME_CHROME } from '@shared/theme'
import { FindBarHost } from './find-bar'
import { registerIpc } from './ipc'
import type { ActiveClientHolder } from './txt2img-generate'

let mainWindow: BrowserWindow | null = null
const activeClient: ActiveClientHolder = { client: null }
const findBar = new FindBarHost(() => mainWindow)

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const lightChrome = THEME_CHROME.light

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_DISPLAY_NAME,
    backgroundColor: lightChrome.bg,
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 10 } }
      : {
          titleBarOverlay: {
            color: lightChrome.bg,
            symbolColor: lightChrome.fg,
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
      return
    }
    const mod = input.control || input.meta
    if (mod && !input.alt && input.key.toLowerCase() === 'f') {
      event.preventDefault()
      void findBar.open()
      return
    }
    if (findBar.isOpen() && input.key === 'Escape') {
      event.preventDefault()
      findBar.close()
    }
  })

  mainWindow.webContents.on('found-in-page', (_event, result) => {
    findBar.sendFound({
      requestId: result.requestId,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate,
    })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    findBar.prefetch()
  })

  // 右键菜单：查看词条 / 格式化 Prompt / 复制元数据 / 检查元素（剪切复制粘贴用快捷键）
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
          let promptField = null;
          const fieldEl = at && typeof at.closest === 'function'
            ? at.closest('[data-prompt-field]')
            : null;
          if (fieldEl && typeof fieldEl.getAttribute === 'function') {
            const attr = fieldEl.getAttribute('data-prompt-field');
            if (attr === 'prompt' || attr === 'negativePrompt') promptField = attr;
          }
          if (!promptField) {
            const el = document.activeElement;
            if (el && typeof el.getAttribute === 'function') {
              const attr = el.getAttribute('data-prompt-field');
              if (attr === 'prompt' || attr === 'negativePrompt') promptField = attr;
            }
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

    const selectedTag = params.selectionText?.trim()
    if (selectedTag) {
      template.push({
        label: '查看词条',
        click: () => {
          win.webContents.send(IPC.promptPreview.viewTag, selectedTag)
        },
      })
    }

    if (promptField) {
      template.push({
        label: '格式化',
        click: () => {
          win.webContents.send(IPC.txt2img.format, promptField)
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
            win.webContents.send(IPC.image.metadataCopied, { ok: true })
          } catch (err) {
            win.webContents.send(IPC.image.metadataCopied, {
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            })
          }
        },
      })
    }

    template.push({
      label: '检查元素',
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aigc.ui')
  }

  initComfyProcess(() => mainWindow)
  registerIpc({
    getMainWindow: () => mainWindow,
    activeClient,
    findBar,
  })
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
