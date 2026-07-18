import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createEmptyPromptPool,
  sanitizePoolName,
  type PromptPool,
  type PromptPoolEntry,
} from '@/random/prompt-pool-types'

function normalizeEntries(raw: unknown): PromptPoolEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e): PromptPoolEntry => {
    const row = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    return {
      prompt: typeof row.prompt === 'string' ? row.prompt : '',
      weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : 1,
    }
  })
}

export function normalizePromptPool(
  raw: Partial<PromptPool> & { name?: string },
  fileName?: string,
): PromptPool {
  const fallback = fileName?.replace(/\.json$/i, '') || 'pool'
  return {
    name: sanitizePoolName(
      typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback,
      sanitizePoolName(fallback),
    ),
    entries: normalizeEntries(raw.entries),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    builtin: raw.builtin === true,
  }
}

export const usePromptPoolStore = defineStore('promptPool', () => {
  const pools = ref<PromptPool[]>([])
  const selectedName = ref('')
  const hydrated = ref(false)
  let hydratePromise: Promise<void> | null = null

  const selected = computed(
    () => pools.value.find((p) => p.name === selectedName.value) ?? pools.value[0] ?? null,
  )

  async function refresh(): Promise<void> {
    const list = (await window.api.promptPools.list()) as PromptPool[]
    pools.value = list.map((p) => normalizePromptPool(p))
    if (!pools.value.some((p) => p.name === selectedName.value)) {
      selectedName.value = pools.value[0]?.name ?? ''
    }
  }

  async function hydrate(): Promise<void> {
    if (hydratePromise) return hydratePromise
    hydratePromise = (async () => {
      try {
        await refresh()
      } finally {
        hydrated.value = true
        hydratePromise = null
      }
    })()
    return hydratePromise
  }

  function select(name: string): void {
    if (pools.value.some((p) => p.name === name)) selectedName.value = name
  }

  function getByName(name: string): PromptPool | null {
    const key = name.trim().toLowerCase()
    if (!key) return null
    return pools.value.find((p) => p.name.trim().toLowerCase() === key) ?? null
  }

  async function create(name?: string): Promise<PromptPool> {
    await hydrate()
    const existing = pools.value.map((p) => p.name)
    let base = sanitizePoolName(name || 'pool')
    if (existing.some((n) => n.toLowerCase() === base.toLowerCase())) {
      let i = 2
      while (existing.some((n) => n.toLowerCase() === `${base}_${i}`.toLowerCase())) i++
      base = `${base}_${i}`
    }
    const pool = createEmptyPromptPool(base)
    const saved = (await window.api.promptPools.write(pool)) as PromptPool
    await refresh()
    selectedName.value = saved.name
    return normalizePromptPool(saved)
  }

  async function duplicate(name: string): Promise<PromptPool | null> {
    await hydrate()
    const src = getByName(name)
    if (!src) return null
    const existing = pools.value.map((p) => p.name)
    let nextName = sanitizePoolName(`${src.name}_copy`)
    if (existing.some((n) => n.toLowerCase() === nextName.toLowerCase())) {
      let i = 2
      while (existing.some((n) => n.toLowerCase() === `${src.name}_copy_${i}`.toLowerCase())) i++
      nextName = `${src.name}_copy_${i}`
    }
    const copy: PromptPool = {
      ...JSON.parse(JSON.stringify(src)),
      name: nextName,
      updatedAt: Date.now(),
    }
    const saved = (await window.api.promptPools.write(copy)) as PromptPool
    await refresh()
    selectedName.value = saved.name
    return normalizePromptPool(saved)
  }

  async function remove(name: string): Promise<void> {
    await hydrate()
    const cur = getByName(name)
    if (!cur) return
    if (cur.builtin) throw new Error('内置提示词池不可删除（可先复制再改）')
    if (pools.value.length <= 1) return
    await window.api.promptPools.remove(name)
    await refresh()
  }

  async function update(name: string, patch: Partial<PromptPool>): Promise<void> {
    await hydrate()
    const cur = getByName(name)
    if (!cur) return
    const next = normalizePromptPool({
      ...cur,
      ...patch,
      name: cur.name,
      updatedAt: Date.now(),
    })
    await window.api.promptPools.write(next)
    await refresh()
  }

  async function rename(oldName: string, newName: string): Promise<void> {
    await hydrate()
    const cur = getByName(oldName)
    if (!cur) return
    if (cur.builtin) throw new Error('内置提示词池不可重命名（可先复制再改）')
    const next = sanitizePoolName(newName)
    if (!next || next === oldName) return
    const saved = (await window.api.promptPools.rename(oldName, next)) as PromptPool
    await refresh()
    selectedName.value = saved.name
  }

  return {
    pools,
    selectedName,
    selected,
    hydrated,
    hydrate,
    refresh,
    select,
    getByName,
    create,
    duplicate,
    remove,
    update,
    rename,
  }
})
