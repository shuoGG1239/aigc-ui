import { app, BrowserWindow, clipboard, Menu, shell } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { extractPngInfo } from './png-info'
import { initComfyProcess, stopComfySync } from './comfy-process'
import { APP_DISPLAY_NAME } from '@shared/app-defaults'
import { registerIpc } from './ipc'
import type { ActiveClientHolder } from './txt2img-generate'

let mainWindow: BrowserWindow | null = null
const activeClient: ActiveClientHolder = { client: null }

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_DISPLAY_NAME,
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aigc.ui')
  }

  initComfyProcess(() => mainWindow)
  registerIpc({
    getMainWindow: () => mainWindow,
    activeClient,
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
