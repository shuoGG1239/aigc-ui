import { reactive } from 'vue'

export type ToastKind = 'info' | 'ok' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const toasts = reactive<ToastItem[]>([])
const timers = new Map<number, number>()
let seq = 1

function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer != null) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx >= 0) toasts.splice(idx, 1)
}

export function useToast() {
  function push(kind: ToastKind, message: string, ms = 3500): void {
    const id = seq++
    toasts.push({ id, kind, message })
    timers.set(
      id,
      window.setTimeout(() => dismiss(id), ms),
    )
  }

  return {
    toasts,
    dismiss,
    info: (message: string, ms = 3500) => push('info', message, ms),
    ok: (message: string, ms = 3500) => push('ok', message, ms),
    error: (message: string, ms = 4500) => push('error', message, ms),
  }
}
