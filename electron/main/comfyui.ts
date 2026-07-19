import { randomUUID } from 'crypto'
import type { HealthResult } from './types'

export type ComfyProgressEvent = {
  promptId: string
  value: number
  max: number
  node: string | null
  kind: 'progress' | 'executing' | 'started'
}

type ProgressListener = (evt: ComfyProgressEvent) => void

export class ComfyUIClient {
  private cancelled = false
  readonly clientId = randomUUID()
  private ws: WebSocket | null = null
  private progressListener: ProgressListener | null = null
  private watchedPromptId: string | null = null
  /** Last step progress for the watched prompt (so executing can keep value/max). */
  private lastValue = 0
  private lastMax = 0

  constructor(private baseUrl: string) {}

  cancel(): void {
    this.cancelled = true
    void this.interrupt()
  }

  resetCancel(): void {
    this.cancelled = false
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  private wsUrl(): string {
    const u = new URL(this.baseUrl.replace(/\/$/, ''))
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/ws'
    u.search = `clientId=${encodeURIComponent(this.clientId)}`
    return u.toString()
  }

  /** Open `/ws` for progress. Soft-fails: generate still works via history poll. */
  async openProgress(listener: ProgressListener): Promise<void> {
    this.closeProgress()
    this.progressListener = listener

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }

      let ws: WebSocket
      try {
        ws = new WebSocket(this.wsUrl())
      } catch {
        finish()
        return
      }

      this.ws = ws
      const timer = setTimeout(() => {
        try {
          ws.close()
        } catch {
          // ignore
        }
        if (this.ws === ws) this.ws = null
        finish()
      }, 8_000)

      ws.onopen = () => {
        clearTimeout(timer)
        finish()
      }

      ws.onerror = () => {
        clearTimeout(timer)
        finish()
      }

      ws.onclose = () => {
        clearTimeout(timer)
        if (this.ws === ws) this.ws = null
        finish()
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return
        this.handleWsMessage(ev.data)
      }
    })
  }

  closeProgress(): void {
    this.progressListener = null
    this.watchedPromptId = null
    this.lastValue = 0
    this.lastMax = 0
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }

  watchPrompt(promptId: string): void {
    this.watchedPromptId = promptId
    this.lastValue = 0
    this.lastMax = 0
  }

  private handleWsMessage(raw: string): void {
    const listener = this.progressListener
    if (!listener) return

    let msg: { type?: string; data?: Record<string, unknown> }
    try {
      msg = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> }
    } catch {
      return
    }

    const type = msg.type
    const data = msg.data ?? {}
    const promptId = typeof data.prompt_id === 'string' ? data.prompt_id : ''
    if (this.watchedPromptId && promptId && promptId !== this.watchedPromptId) {
      return
    }

    if (type === 'execution_start') {
      if (!promptId) return
      listener({
        promptId,
        value: this.lastValue,
        max: this.lastMax,
        node: null,
        kind: 'started',
      })
      return
    }

    if (type === 'progress') {
      const value = Number(data.value)
      const max = Number(data.max)
      if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return
      this.lastValue = value
      this.lastMax = max
      const node = data.node != null ? String(data.node) : null
      listener({
        promptId: promptId || this.watchedPromptId || '',
        value,
        max,
        node,
        kind: 'progress',
      })
      return
    }

    if (type === 'executing') {
      const node =
        data.node === null || data.node === undefined ? null : String(data.node)
      listener({
        promptId: promptId || this.watchedPromptId || '',
        value: this.lastValue,
        max: this.lastMax,
        node,
        kind: 'executing',
      })
    }
  }

  async interrupt(): Promise<void> {
    try {
      await this.request('POST', '/interrupt', {}, 5_000)
    } catch {
      // best-effort
    }
  }

  async request(method: string, path: string, payload?: unknown, timeoutMs = 120_000): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers: {},
      }

      if (payload !== undefined) {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = JSON.stringify(payload)
      }

      const resp = await fetch(this.url(path), init)
      const text = await resp.text()

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`)
      }

      return text ? JSON.parse(text) : {}
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`请求超时 (${timeoutMs}ms): ${path}`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      await this.request('GET', '/system_stats', undefined, 5_000)
      return { ok: true, message: '已连接' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        message: `无法连接 ComfyUI (${this.baseUrl}): ${message}`,
      }
    }
  }

  /** List model filenames under a ComfyUI model folder (e.g. checkpoints, unet, clip, vae). */
  async listModels(folder: string): Promise<string[]> {
    const name = folder.trim()
    if (!name) throw new Error('模型目录为空')

    const paths = [`/models/${encodeURIComponent(name)}`, `/api/models/${encodeURIComponent(name)}`]
    let lastError: unknown
    for (const path of paths) {
      try {
        const data = await this.request('GET', path, undefined, 10_000)
        if (!Array.isArray(data)) {
          throw new Error(`无效的模型列表响应: ${path}`)
        }
        return data
          .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object' && 'name' in item) {
              return String((item as { name: unknown }).name)
            }
            return ''
          })
          .map((s) => s.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      } catch (err) {
        lastError = err
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`获取 ${name} 模型列表失败: ${message}`)
  }

  async queuePrompt(workflow: Record<string, unknown>): Promise<string> {
    const result = (await this.request('POST', '/prompt', {
      prompt: workflow,
      client_id: this.clientId,
    })) as { prompt_id?: string }

    if (!result.prompt_id) {
      throw new Error('提交失败：未返回 prompt_id')
    }
    this.watchPrompt(result.prompt_id)
    return result.prompt_id
  }

  async waitForCompletion(
    promptId: string,
    pollIntervalMs = 1_000,
    timeoutMs = 600_000,
  ): Promise<Record<string, unknown>> {
    this.watchPrompt(promptId)
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (this.cancelled) {
        throw new Error('已取消生成')
      }

      const history = (await this.request('GET', `/history/${promptId}`, undefined, 30_000)) as Record<
        string,
        unknown
      >

      if (promptId in history) {
        const entry = history[promptId] as {
          status?: { status_str?: string; messages?: unknown[] }
          outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>
        }

        if (entry.status?.status_str === 'error') {
          throw new Error(`ComfyUI 生成失败: ${JSON.stringify(entry.status.messages ?? [])}`)
        }
        return entry as Record<string, unknown>
      }

      await sleep(pollIntervalMs)
    }

    throw new Error(`等待超时 (${timeoutMs / 1000}s), prompt_id=${promptId}`)
  }

  extractOutputImages(historyEntry: Record<string, unknown>): Array<{
    filename: string
    subfolder: string
    type: string
  }> {
    const outputs = (historyEntry.outputs ?? {}) as Record<
      string,
      { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
    >
    const images: Array<{ filename: string; subfolder: string; type: string }> = []

    for (const nodeOutput of Object.values(outputs)) {
      for (const img of nodeOutput.images ?? []) {
        images.push({
          filename: img.filename,
          subfolder: img.subfolder ?? '',
          type: img.type ?? 'output',
        })
      }
    }
    return images
  }

  async downloadImage(filename: string, subfolder: string, folderType: string): Promise<Buffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type: folderType,
    })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    try {
      const resp = await fetch(this.url(`/view?${params}`), { signal: controller.signal })
      if (!resp.ok) {
        throw new Error(`下载图片失败 HTTP ${resp.status}`)
      }
      const ab = await resp.arrayBuffer()
      return Buffer.from(ab)
    } finally {
      clearTimeout(timer)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
