import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { loadBuiltinPromptPools } from './builtin-prompt-pools'

export interface PromptPoolEntryFile {
  prompt: string
  weight: number
}

export interface PromptPoolFile {
  name: string
  entries: PromptPoolEntryFile[]
  updatedAt: number
  /** True when serving embedded data (no userData override). */
  builtin: boolean
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/

const builtins = loadBuiltinPromptPools()

/** User-editable pools live under userData (overrides builtins by name). */
export function promptPoolsDir(): string {
  const dir = join(app.getPath('userData'), 'prompt_pools')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function sanitizeName(raw: string, fallback = 'pool'): string {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[_\-]+|[_\-]+$/g, '')
  return s || fallback
}

function userFilePath(name: string): string {
  const n = sanitizeName(name)
  if (!NAME_RE.test(n)) throw new Error(`非法提示词池名: ${name}`)
  return join(promptPoolsDir(), `${n}.json`)
}

function normalizePool(raw: unknown, fileName: string, builtin: boolean): PromptPoolFile {
  const stem = fileName.replace(/\.json$/i, '')
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const name = sanitizeName(typeof obj.name === 'string' ? obj.name : stem, stem)
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map((e) => {
        const row = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
        return {
          prompt: typeof row.prompt === 'string' ? row.prompt : '',
          weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : 1,
        }
      })
    : []
  return {
    name: NAME_RE.test(name) ? name : stem,
    entries,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    builtin,
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

function readUserPool(name: string): PromptPoolFile | null {
  const path = userFilePath(name)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return normalizePool(raw, `${sanitizeName(name)}.json`, false)
  } catch {
    return null
  }
}

function builtinAsPool(nameKey: string): PromptPoolFile | null {
  const b = builtins.get(nameKey.toLowerCase())
  if (!b) return null
  return {
    name: b.name,
    entries: b.entries.map((e) => ({ ...e })),
    updatedAt: b.updatedAt,
    builtin: true,
  }
}

export function listPromptPools(): PromptPoolFile[] {
  const byKey = new Map<string, PromptPoolFile>()

  for (const b of builtins.values()) {
    byKey.set(b.name.toLowerCase(), {
      name: b.name,
      entries: b.entries.map((e) => ({ ...e })),
      updatedAt: b.updatedAt,
      builtin: true,
    })
  }

  const dir = promptPoolsDir()
  for (const file of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json'))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      const pool = normalizePool(raw, file, false)
      byKey.set(pool.name.toLowerCase(), pool)
    } catch {
      // skip broken files
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function readPromptPool(name: string): PromptPoolFile | null {
  const user = readUserPool(name)
  if (user) return user
  return builtinAsPool(sanitizeName(name))
}

export function writePromptPool(pool: PromptPoolFile): PromptPoolFile {
  const name = sanitizeName(pool.name)
  if (!NAME_RE.test(name)) throw new Error(`非法提示词池名: ${pool.name}`)
  const next: PromptPoolFile = {
    name,
    entries: Array.isArray(pool.entries)
      ? pool.entries.map((e) => ({
          prompt: typeof e.prompt === 'string' ? e.prompt : '',
          weight: Number.isFinite(Number(e.weight)) ? Number(e.weight) : 1,
        }))
      : [],
    updatedAt: Date.now(),
    builtin: false,
  }
  // Persist without the runtime-only `builtin` flag.
  writeJson(userFilePath(name), {
    name: next.name,
    entries: next.entries,
    updatedAt: next.updatedAt,
  })
  return next
}

export function removePromptPool(name: string): boolean {
  const key = sanitizeName(name)
  const path = userFilePath(key)
  const hasUser = existsSync(path)
  const hasBuiltin = builtins.has(key.toLowerCase())

  if (!hasUser) {
    if (hasBuiltin) throw new Error('内置提示词池不可删除（可先复制再改）')
    return false
  }

  const remaining = listPromptPools().filter((p) => p.name.toLowerCase() !== key.toLowerCase())
  // After delete: if user override of builtin, builtin remains — always ok.
  // If pure user pool, ensure at least one pool left.
  if (!hasBuiltin && remaining.length === 0) {
    throw new Error('至少保留一个提示词池')
  }

  unlinkSync(path)
  return true
}

export function renamePromptPool(oldName: string, newName: string): PromptPoolFile {
  const from = sanitizeName(oldName)
  const to = sanitizeName(newName)
  if (!NAME_RE.test(to)) throw new Error(`非法提示词池名: ${newName}`)

  const src = readPromptPool(from)
  if (!src) throw new Error('提示词池不存在')
  if (src.builtin) throw new Error('内置提示词池不可重命名（可先复制再改）')

  if (from.toLowerCase() === to.toLowerCase()) return src

  const dest = userFilePath(to)
  if (existsSync(dest) || builtins.has(to.toLowerCase())) {
    throw new Error(`提示词池已存在: ${to}`)
  }

  const next = writePromptPool({ ...src, name: to, builtin: false })
  const fromPath = userFilePath(from)
  if (existsSync(fromPath)) unlinkSync(fromPath)
  return next
}
