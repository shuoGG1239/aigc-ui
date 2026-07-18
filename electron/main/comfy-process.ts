import { spawn, type ChildProcessWithoutNullStreams, execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import type { BrowserWindow } from 'electron'
import type { AppSettings, ComfyProcessStatus } from './types'

const execFileAsync = promisify(execFile)

const MAX_LOG_LINES = 2000

export type ComfyLogLevel = 'info' | 'stdout' | 'stderr' | 'system'

export interface ComfyLogLine {
  id: number
  ts: number
  level: ComfyLogLevel
  text: string
}

let child: ChildProcessWithoutNullStreams | null = null
let running = false
let pid: number | null = null
let logSeq = 1
const logs: ComfyLogLine[] = []
let getWindow: () => BrowserWindow | null = () => null

export function initComfyProcess(getter: () => BrowserWindow | null): void {
  getWindow = getter
}

function pushLog(level: ComfyLogLevel, text: string): void {
  const line: ComfyLogLine = {
    id: logSeq++,
    ts: Date.now(),
    level,
    text: text.replace(/\r/g, ''),
  }
  logs.push(line)
  if (logs.length > MAX_LOG_LINES) {
    logs.splice(0, logs.length - MAX_LOG_LINES)
  }
  try {
    getWindow()?.webContents.send('comfyProcess:log', line)
  } catch {
    // window may already be destroyed during quit
  }
}

function emitStatus(): void {
  try {
    getWindow()?.webContents.send('comfyProcess:status', getStatus())
  } catch {
    // ignore
  }
}

export function getStatus(): ComfyProcessStatus {
  return {
    running,
    pid,
  }
}

export function getLogs(): ComfyLogLine[] {
  return [...logs]
}

export function clearLogs(): void {
  logs.length = 0
  try {
    getWindow()?.webContents.send('comfyProcess:cleared')
  } catch {
    // ignore
  }
}

function killProcessTreeSync(targetPid: number): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(targetPid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch {
      // process may already be gone
    }
    return
  }

  try {
    process.kill(-targetPid, 'SIGKILL')
  } catch {
    try {
      process.kill(targetPid, 'SIGKILL')
    } catch {
      // ignore
    }
  }
}

async function killProcessTree(targetPid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(targetPid), '/T', '/F'], {
        windowsHide: true,
      })
    } catch {
      // process may already be gone
    }
    return
  }

  try {
    process.kill(-targetPid, 'SIGTERM')
  } catch {
    try {
      process.kill(targetPid, 'SIGTERM')
    } catch {
      // ignore
    }
  }
}

function resetState(): void {
  child = null
  running = false
  pid = null
}

/** 退出客户端时同步杀掉进程树，避免 async 未完成就退出 */
export function stopComfySync(): void {
  const targetPid = pid
  if (targetPid) {
    killProcessTreeSync(targetPid)
  }
  if (child) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
  resetState()
}

export async function startComfy(settings: AppSettings): Promise<ComfyProcessStatus> {
  if (running && child) {
    throw new Error('ComfyUI 已在运行中')
  }

  const command = settings.launchCommand.trim()
  if (!command) {
    throw new Error('请填写启动命令')
  }

  pushLog('system', `启动中…`)
  pushLog('system', command)

  child = spawn(command, {
    env: { ...process.env },
    shell: true,
    windowsHide: true,
    detached: false,
  })

  running = true
  pid = child.pid ?? null
  emitStatus()

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  child.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split(/\n/)) {
      if (line.length) pushLog('stdout', line)
    }
  })

  child.stderr.on('data', (chunk: string) => {
    for (const line of chunk.split(/\n/)) {
      if (line.length) pushLog('stderr', line)
    }
  })

  child.on('error', (err) => {
    pushLog('system', `进程错误: ${err.message}`)
    resetState()
    emitStatus()
  })

  child.on('close', (code, signal) => {
    pushLog('system', `进程已退出 code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    resetState()
    emitStatus()
  })

  return getStatus()
}

export async function stopComfy(): Promise<ComfyProcessStatus> {
  const targetPid = pid
  if (!targetPid && !child) {
    resetState()
    emitStatus()
    return getStatus()
  }

  if (targetPid) {
    pushLog('system', `正在停止进程 pid=${targetPid} …`)
    await killProcessTree(targetPid)
  }

  if (child) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }

  await new Promise((r) => setTimeout(r, 200))
  resetState()
  emitStatus()
  return getStatus()
}
