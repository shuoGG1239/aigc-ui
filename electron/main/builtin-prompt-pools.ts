import {
  normalizePromptPool,
  type PromptPool,
} from '@shared/prompt-pool-types'

/**
 * Built-in prompt pools — Vite embeds `web/src/prompt/prompt-pools/*.json`
 * into the main bundle at build time (Go `embed` style).
 */
const modules = import.meta.glob('../../web/src/prompt/prompt-pools/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

export type BuiltinPromptPool = Omit<PromptPool, 'builtin'>

function stemFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() || 'pool'
  return base.replace(/\.json$/i, '')
}

/** Snapshot of embedded pools (name → pool). */
export function loadBuiltinPromptPools(): Map<string, BuiltinPromptPool> {
  const map = new Map<string, BuiltinPromptPool>()
  for (const [path, raw] of Object.entries(modules)) {
    const obj = raw && typeof raw === 'object' ? (raw as Partial<PromptPool>) : null
    if (!obj) continue
    const pool = normalizePromptPool(obj, {
      fileName: stemFromPath(path) + '.json',
      builtin: true,
      defaultUpdatedAt: 0,
    })
    map.set(pool.name.toLowerCase(), {
      name: pool.name,
      entries: pool.entries,
      updatedAt: pool.updatedAt,
    })
  }
  return map
}
