import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import {
  isValidPoolName,
  normalizePromptPool,
  sanitizePoolName,
  type PromptPool,
} from '@shared/prompt-pool-types'
import {
  isProgramPoolName,
  listProgramPoolNames,
} from '@shared/program-pools'
import { loadBuiltinPromptPools } from './builtin-prompt-pools'

export type PromptPoolFile = PromptPool & { builtin: boolean }

const builtins = loadBuiltinPromptPools()

/** User-editable pools live under userData (overrides builtins by name). */
export function promptPoolsDir(): string {
  const dir = join(app.getPath('userData'), 'prompt-pools')
  const legacy = join(app.getPath('userData'), 'prompt_pools')
  if (!existsSync(dir) && existsSync(legacy)) {
    renameSync(legacy, dir)
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function userFilePath(name: string): string {
  const n = sanitizePoolName(name)
  if (!isValidPoolName(n)) throw new Error(`非法提示词池名: ${name}`)
  return join(promptPoolsDir(), `${n}.json`)
}

function fromUserFile(raw: unknown, fileName: string): PromptPoolFile {
  const pool = normalizePromptPool(raw as Partial<PromptPool>, {
    fileName,
    builtin: false,
  })
  return { ...pool, builtin: false }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

function readUserPool(name: string): PromptPoolFile | null {
  const path = userFilePath(name)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return fromUserFile(raw, `${sanitizePoolName(name)}.json`)
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
      const pool = fromUserFile(raw, file)
      // Reserved opaque pool names cannot be shadowed by user JSON.
      if (isProgramPoolName(pool.name)) continue
      byKey.set(pool.name.toLowerCase(), pool)
    } catch {
      // skip broken files
    }
  }

  // Opaque program pools: list as empty stubs (internals stay in program-pools).
  for (const name of listProgramPoolNames()) {
    byKey.set(name.toLowerCase(), {
      name,
      entries: [],
      updatedAt: 0,
      builtin: true,
    })
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function writePromptPool(pool: PromptPoolFile | PromptPool): PromptPoolFile {
  const name = sanitizePoolName(pool.name)
  if (!isValidPoolName(name)) throw new Error(`非法提示词池名: ${pool.name}`)
  if (isProgramPoolName(name)) throw new Error(`提示词池名已保留: ${name}`)
  const next = normalizePromptPool(
    { ...pool, name, updatedAt: Date.now() },
    { builtin: false },
  )
  writeJson(userFilePath(name), {
    name: next.name,
    entries: next.entries,
    updatedAt: next.updatedAt,
  })
  return { ...next, builtin: false }
}

export function removePromptPool(name: string): boolean {
  const key = sanitizePoolName(name)
  if (isProgramPoolName(key)) throw new Error(`提示词池名已保留: ${key}`)
  const path = userFilePath(key)
  const hasUser = existsSync(path)
  const hasBuiltin = builtins.has(key.toLowerCase())

  if (!hasUser) {
    if (hasBuiltin) throw new Error('内置提示词池不可删除（可先复制再改）')
    return false
  }

  const remaining = listPromptPools().filter((p) => p.name.toLowerCase() !== key.toLowerCase())
  if (!hasBuiltin && remaining.length === 0) {
    throw new Error('至少保留一个提示词池')
  }

  unlinkSync(path)
  return true
}

export function renamePromptPool(oldName: string, newName: string): PromptPoolFile {
  const from = sanitizePoolName(oldName)
  const to = sanitizePoolName(newName)
  if (!isValidPoolName(to)) throw new Error(`非法提示词池名: ${newName}`)

  if (isProgramPoolName(from) || isProgramPoolName(to)) {
    throw new Error('提示词池名已保留')
  }

  const src = readUserPool(from) ?? builtinAsPool(from)
  if (!src) throw new Error('提示词池不存在')
  if (src.builtin) throw new Error('内置提示词池不可重命名（可先复制再改）')

  if (from.toLowerCase() === to.toLowerCase()) return src

  const dest = userFilePath(to)
  if (existsSync(dest) || builtins.has(to.toLowerCase()) || isProgramPoolName(to)) {
    throw new Error(`提示词池已存在: ${to}`)
  }

  const next = writePromptPool({ ...src, name: to, builtin: false })
  const fromPath = userFilePath(from)
  if (existsSync(fromPath)) unlinkSync(fromPath)
  return next
}
