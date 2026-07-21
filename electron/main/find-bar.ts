import { WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { FindInPageResult } from '@shared/ipc-types'
import type { ThemeMode } from '@shared/theme'

/** Visible bar size (CSS). View is larger for shadow + slide animation. */
const BAR_W = 318
const BAR_H = 40
const PAD_X = 12
const PAD_Y = 14
const VIEW_W = BAR_W + PAD_X * 2
const VIEW_H = BAR_H + PAD_Y * 2
const TOP = 36
const RIGHT = 4
const EXIT_MS = 200

/**
 * Find UI in a separate WebContentsView so findInPage on the page
 * cannot steal focus / break IME in the search input.
 */
export class FindBarHost {
  private view: WebContentsView | null = null
  private attached = false
  private closing = false
  private ready: Promise<void> | null = null
  private theme: ThemeMode = 'light'
  private resizeHooked: BrowserWindow | null = null
  private closeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  isOpen(): boolean {
    return this.attached && !this.closing
  }

  setTheme(mode: ThemeMode): void {
    this.theme = mode
    this.view?.webContents.send(IPC.find.setTheme, mode)
  }

  /** Create & load early so first Ctrl+F is instant. */
  prefetch(): void {
    this.ensureView()
  }

  async open(): Promise<void> {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
    }
    this.closing = false

    const win = this.getWindow()
    if (!win) return
    const view = this.ensureView()
    this.hookResize(win)

    if (!this.attached) {
      win.contentView.addChildView(view)
      this.attached = true
    } else {
      // Raise z-order
      win.contentView.addChildView(view)
    }

    this.layout(win)

    try {
      if (this.ready) {
        await Promise.race([
          this.ready,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ])
      }
    } catch {
      // ignore
    }

    view.webContents.focus()
    view.webContents.send(IPC.find.setTheme, this.theme)
    // rAF-equivalent delay so CSS enter transition runs after attach
    setTimeout(() => {
      if (!this.attached || this.closing) return
      view.webContents.send(IPC.find.activate)
    }, 16)
  }

  /** Animate out, then detach. Safe to call repeatedly. */
  close(): void {
    if (!this.attached || this.closing) {
      // Still ensure page focus if somehow stuck
      this.getWindow()?.webContents.focus()
      return
    }
    this.closing = true
    this.view?.webContents.send(IPC.find.deactivate)
    this.getPageWebContents()?.stopFindInPage('clearSelection')

    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = setTimeout(() => {
      this.closeTimer = undefined
      this.detach()
    }, EXIT_MS)
  }

  /** Immediate detach (used after UI signals animation done, or fallback). */
  detach(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
    }
    const win = this.getWindow()
    const view = this.view
    if (win && view && this.attached) {
      win.contentView.removeChildView(view)
    }
    this.attached = false
    this.closing = false
    // Critical: return keyboard focus to the main page so Ctrl+F works again.
    win?.webContents.focus()
  }

  sendFound(result: FindInPageResult): void {
    if (!this.view || !this.attached || this.closing) return
    this.view.webContents.send(IPC.find.found, result)
  }

  findInPage(
    text: string,
    opts?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
  ): number {
    const wc = this.getPageWebContents()
    if (!wc) return 0
    const q = String(text ?? '')
    if (!q) {
      wc.stopFindInPage('clearSelection')
      return 0
    }
    return wc.findInPage(q, {
      forward: opts?.forward !== false,
      findNext: opts?.findNext === true,
      matchCase: opts?.matchCase === true,
    })
  }

  stopFind(): void {
    this.getPageWebContents()?.stopFindInPage('clearSelection')
  }

  private getPageWebContents() {
    return this.getWindow()?.webContents ?? null
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    view.setBackgroundColor('#00000000')

    this.ready = new Promise<void>((resolve) => {
      const done = () => {
        this.ready = null
        resolve()
      }
      view.webContents.once('did-finish-load', done)
      view.webContents.once('did-fail-load', () => done())
    })

    const url = process.env.ELECTRON_RENDERER_URL
    if (url) {
      void view.webContents.loadURL(`${url.replace(/\/$/, '')}/find-bar.html`)
    } else {
      void view.webContents.loadFile(join(__dirname, '../renderer/find-bar.html'))
    }

    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const mod = input.control || input.meta
      if (mod && !input.alt && input.key.toLowerCase() === 'f') {
        event.preventDefault()
        // Always open() — activate alone is not enough if we were closing/detached.
        void this.open()
        return
      }
      if (input.key === 'Escape') {
        event.preventDefault()
        this.close()
      }
    })

    this.view = view
    return view
  }

  private hookResize(win: BrowserWindow): void {
    if (this.resizeHooked === win) return
    this.resizeHooked = win
    win.on('resize', () => {
      if (this.attached) this.layout(win)
    })
  }

  private layout(win: BrowserWindow): void {
    if (!this.view) return
    const [width] = win.getContentSize()
    this.view.setBounds({
      x: Math.max(0, width - VIEW_W - RIGHT),
      y: TOP,
      width: VIEW_W,
      height: VIEW_H,
    })
  }
}
