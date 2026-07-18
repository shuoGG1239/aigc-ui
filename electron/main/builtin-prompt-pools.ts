/**
 * Built-in prompt pools — Vite embeds `web/src/random/prompt_pools/*.json`
 * into the main bundle at build time (Go `embed` style).
 */
const modules = import.meta.glob('../../web/src/random/prompt_pools/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

export interface BuiltinPromptPool {
  name: string
  entries: Array<{ prompt: string; weight: number }>
  updatedAt: number
}

function stemFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() || 'pool'
  return base.replace(/\.json$/i, '')
}

function normalizeBuiltin(raw: unknown, filePath: string): BuiltinPromptPool | null {
  const stem = stemFromPath(filePath)
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!obj) return null
  const nameRaw = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : stem
  const name = nameRaw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!name) return null
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
    name,
    entries,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  }
}

/** Snapshot of embedded pools (name → pool). */
export function loadBuiltinPromptPools(): Map<string, BuiltinPromptPool> {
  const map = new Map<string, BuiltinPromptPool>()
  for (const [path, raw] of Object.entries(modules)) {
    const pool = normalizeBuiltin(raw, path)
    if (!pool) continue
    map.set(pool.name.toLowerCase(), pool)
  }
  return map
}
