import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'

export interface RollEntryFile {
  tag: string
  weight: number
}

export interface RollWorkflowFile {
  name: string
  entries: RollEntryFile[]
  updatedAt: number
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/

/** Project workflows dir: web/src/roll/workflows (relative to out/main). */
export function workflowsDir(): string {
  const dir = join(__dirname, '../../web/src/roll/workflows')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function sanitizeName(raw: string, fallback = 'workflow'): string {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[_\-]+|[_\-]+$/g, '')
  return s || fallback
}

function filePath(name: string): string {
  const n = sanitizeName(name)
  if (!NAME_RE.test(n)) throw new Error(`非法工作流名: ${name}`)
  return join(workflowsDir(), `${n}.json`)
}

function normalizeWorkflow(raw: unknown, fileName: string): RollWorkflowFile {
  const stem = fileName.replace(/\.json$/i, '')
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const name = sanitizeName(typeof obj.name === 'string' ? obj.name : stem, stem)
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map((e) => {
        const row = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
        return {
          tag: typeof row.tag === 'string' ? row.tag : '',
          weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : 1,
        }
      })
    : []
  return {
    name: NAME_RE.test(name) ? name : stem,
    entries,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
  }
}

export function listWorkflows(): RollWorkflowFile[] {
  const dir = workflowsDir()
  const names = readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
  const out: RollWorkflowFile[] = []
  for (const file of names) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      out.push(normalizeWorkflow(raw, file))
    } catch {
      // skip broken files
    }
  }
  return out
}

export function readWorkflow(name: string): RollWorkflowFile | null {
  const path = filePath(name)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return normalizeWorkflow(raw, `${sanitizeName(name)}.json`)
  } catch {
    return null
  }
}

export function writeWorkflow(wf: RollWorkflowFile): RollWorkflowFile {
  const name = sanitizeName(wf.name)
  if (!NAME_RE.test(name)) throw new Error(`非法工作流名: ${wf.name}`)
  const next: RollWorkflowFile = {
    name,
    entries: Array.isArray(wf.entries) ? wf.entries : [],
    updatedAt: Date.now(),
  }
  writeFileSync(filePath(name), `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  return next
}

export function removeWorkflow(name: string): boolean {
  const path = filePath(name)
  if (!existsSync(path)) return false
  const all = readdirSync(workflowsDir()).filter((n) => n.toLowerCase().endsWith('.json'))
  if (all.length <= 1) throw new Error('至少保留一个工作流')
  unlinkSync(path)
  return true
}

export function renameWorkflow(oldName: string, newName: string): RollWorkflowFile {
  const from = sanitizeName(oldName)
  const to = sanitizeName(newName)
  if (!NAME_RE.test(to)) throw new Error(`非法工作流名: ${newName}`)
  if (from.toLowerCase() === to.toLowerCase()) {
    const cur = readWorkflow(from)
    if (!cur) throw new Error('工作流不存在')
    return cur
  }
  const dest = filePath(to)
  if (existsSync(dest)) throw new Error(`工作流已存在: ${to}`)
  const src = readWorkflow(from)
  if (!src) throw new Error('工作流不存在')
  const next = { ...src, name: to, updatedAt: Date.now() }
  writeFileSync(dest, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  unlinkSync(filePath(from))
  return next
}

export function uniqueName(base: string, existing: string[]): string {
  const root = sanitizeName(base)
  const lower = existing.map((n) => n.toLowerCase())
  if (!lower.includes(root.toLowerCase())) return root
  let i = 2
  while (lower.includes(`${root}_${i}`.toLowerCase())) i++
  return `${root}_${i}`
}

/** Migrate legacy localStorage list into workflows dir. */
export function importWorkflows(list: unknown[]): RollWorkflowFile[] {
  const existing = listWorkflows().map((w) => w.name)
  const created: RollWorkflowFile[] = []
  for (const item of list) {
    try {
      const wf = normalizeWorkflow(item, 'import.json')
      const legacy = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      if ((!wf.name || wf.name === 'import') && typeof legacy.id === 'string') {
        wf.name = sanitizeName(legacy.id)
      }
      wf.name = uniqueName(wf.name || 'workflow', existing)
      existing.push(wf.name)
      created.push(writeWorkflow({ ...wf, updatedAt: Date.now() }))
    } catch {
      // skip
    }
  }
  return created
}
