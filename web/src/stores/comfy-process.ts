import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useComfyProcessStore = defineStore('comfyProcess', () => {
  const running = ref(false)
  const pid = ref<number | null>(null)
  const logs = ref<ComfyLogLine[]>([])
  const busy = ref(false)
  let unsubs: Array<() => void> = []

  function applyStatus(s: ComfyProcessStatus): void {
    running.value = s.running
    pid.value = s.pid
  }

  async function init(): Promise<void> {
    dispose()
    const [status, existing] = await Promise.all([
      window.api.comfyProcess.getStatus(),
      window.api.comfyProcess.getLogs(),
    ])
    applyStatus(status)
    logs.value = existing

    unsubs = [
      window.api.comfyProcess.onLog((line) => {
        logs.value.push(line)
        if (logs.value.length > 2000) {
          logs.value.splice(0, logs.value.length - 2000)
        }
      }),
      window.api.comfyProcess.onStatus((status) => {
        applyStatus(status)
      }),
      window.api.comfyProcess.onCleared(() => {
        logs.value = []
      }),
    ]
  }

  function dispose(): void {
    for (const off of unsubs) off()
    unsubs = []
  }

  async function start(): Promise<void> {
    busy.value = true
    try {
      const status = await window.api.comfyProcess.start()
      applyStatus(status)
    } finally {
      busy.value = false
    }
  }

  async function stop(): Promise<void> {
    busy.value = true
    try {
      const status = await window.api.comfyProcess.stop()
      applyStatus(status)
    } finally {
      busy.value = false
    }
  }

  async function clearLogs(): Promise<void> {
    await window.api.comfyProcess.clearLogs()
    logs.value = []
  }

  return {
    running,
    pid,
    logs,
    busy,
    init,
    dispose,
    start,
    stop,
    clearLogs,
  }
})
