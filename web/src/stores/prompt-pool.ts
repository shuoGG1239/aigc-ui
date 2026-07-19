import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isProgramPoolName } from '@shared/program-pools'
import {
  allocUniquePoolName,
  createEmptyPromptPool,
  isLockedPool,
  normalizePromptPool,
  sanitizePoolName,
  type PromptPool,
} from '@shared/prompt-pool-types'

export const usePromptPoolStore = defineStore('promptPool', () => {
  const pools = ref<PromptPool[]>([])
  const selectedName = ref('')
  const hydrated = ref(false)
  let hydratePromise: Promise<void> | null = null

  const selected = computed(
    () => pools.value.find((p) => p.name === selectedName.value) ?? pools.value[0] ?? null,
  )

  async function refresh(): Promise<void> {
    const list = await window.api.promptPools.list()
    pools.value = list.map((p) => normalizePromptPool(p, { builtin: p.builtin === true }))
    if (!pools.value.some((p) => p.name === selectedName.value)) {
      selectedName.value = pools.value[0]?.name ?? ''
    }
  }

  /** Load once; subsequent calls are no-ops. Use `refresh()` after mutations. */
  async function hydrate(): Promise<void> {
    if (hydrated.value) return
    if (hydratePromise) return hydratePromise
    hydratePromise = (async () => {
      try {
        await refresh()
        hydrated.value = true
      } finally {
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
    const found = pools.value.find((p) => p.name.trim().toLowerCase() === key)
    if (found) return found
    // Resolve before hydrate / if list missed a reserved name.
    if (isProgramPoolName(key)) {
      return {
        name: sanitizePoolName(name),
        entries: [],
        updatedAt: 0,
        builtin: true,
      }
    }
    return null
  }

  async function create(name?: string): Promise<PromptPool> {
    await hydrate()
    const base = allocUniquePoolName(name || 'pool', pools.value.map((p) => p.name))
    if (isProgramPoolName(base)) throw new Error(`提示词池名已保留: ${base}`)
    const pool = createEmptyPromptPool(base)
    const saved = (await window.api.promptPools.write(pool)) as PromptPool
    await refresh()
    selectedName.value = saved.name
    return normalizePromptPool(saved, { builtin: false })
  }

  async function duplicate(name: string): Promise<PromptPool | null> {
    await hydrate()
    if (isProgramPoolName(name)) throw new Error(`提示词池名已保留: ${name}`)
    const src = getByName(name)
    if (!src || isProgramPoolName(src.name)) return null
    const nextName = allocUniquePoolName(`${src.name}_copy`, pools.value.map((p) => p.name))
    const copy: PromptPool = {
      name: nextName,
      entries: src.entries.map((e) => ({ ...e })),
      updatedAt: Date.now(),
      builtin: false,
    }
    const saved = (await window.api.promptPools.write(copy)) as PromptPool
    await refresh()
    selectedName.value = saved.name
    return normalizePromptPool(saved, { builtin: false })
  }

  async function remove(name: string): Promise<void> {
    await hydrate()
    const cur = pools.value.find((p) => p.name === name)
    if (!cur) return
    if (isLockedPool(cur)) throw new Error('内置提示词池不可删除（可先复制再改）')
    if (pools.value.length <= 1) return
    await window.api.promptPools.remove(name)
    await refresh()
  }

  async function update(name: string, patch: Partial<PromptPool>): Promise<void> {
    await hydrate()
    if (isProgramPoolName(name)) throw new Error(`提示词池名已保留: ${name}`)
    const cur = pools.value.find((p) => p.name === name)
    if (!cur) return
    const next = normalizePromptPool(
      {
        ...cur,
        ...patch,
        name: cur.name,
        updatedAt: Date.now(),
      },
      { builtin: false },
    )
    await window.api.promptPools.write(next)
    await refresh()
  }

  async function rename(oldName: string, newName: string): Promise<void> {
    await hydrate()
    const cur = pools.value.find((p) => p.name === oldName)
    if (!cur) return
    if (isLockedPool(cur)) throw new Error('内置提示词池不可重命名（可先复制再改）')
    const next = sanitizePoolName(newName)
    if (!next || next === oldName) return
    if (isProgramPoolName(next)) throw new Error(`提示词池名已保留: ${next}`)
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
