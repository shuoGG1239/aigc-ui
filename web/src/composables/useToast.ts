import { reactive } from 'vue'

export type ToastKind = 'info' | 'ok' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const toasts = reactive<ToastItem[]>([])
let seq = 1

export function useToast() {
  function push(kind: ToastKind, message: string, ms = 3500): void {
    const id = seq++
    toasts.push({ id, kind, message })
    window.setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id)
      if (idx >= 0) toasts.splice(idx, 1)
    }, ms)
  }

  return {
    toasts,
    info: (message: string) => push('info', message),
    ok: (message: string) => push('ok', message),
    error: (message: string) => push('error', message, 4500),
  }
}
