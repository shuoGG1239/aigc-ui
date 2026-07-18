import { randomUUID } from 'crypto'
import type { HealthResult } from './types'

export class ComfyUIClient {
  private cancelled = false

  constructor(private baseUrl: string) {}

  cancel(): void {
    this.cancelled = true
  }

  resetCancel(): void {
    this.cancelled = false
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
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

  async queuePrompt(workflow: Record<string, unknown>): Promise<string> {
    const clientId = randomUUID()
    const result = (await this.request('POST', '/prompt', {
      prompt: workflow,
      client_id: clientId,
    })) as { prompt_id?: string }

    if (!result.prompt_id) {
      throw new Error('提交失败：未返回 prompt_id')
    }
    return result.prompt_id
  }

  async waitForCompletion(
    promptId: string,
    pollIntervalMs = 1_000,
    timeoutMs = 600_000,
  ): Promise<Record<string, unknown>> {
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
