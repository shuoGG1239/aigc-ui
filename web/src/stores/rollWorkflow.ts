import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createEmptyWorkflow,
  sanitizeWorkflowName,
  type RollEntry,
  type RollWorkflow,
} from '@/roll/workflow-types'

const STORAGE_KEY = 'aigc-ui:roll-workflows'

type LegacyWorkflow = Partial<RollWorkflow> & {
  id?: string
  count?: number
  counts?: number[]
  slots?: Record<string, { enabled?: boolean; count?: number; entries?: unknown[] }>
}

function normalizeEntries(raw: unknown): RollEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e): RollEntry => {
    const tagRaw = typeof e?.tag === 'string' ? e.tag : ''
    return {
      tag: tagRaw,
      weight: Number.isFinite(Number(e?.weight)) ? Number(e.weight) : 1,
    }
  })
}

function migrateFromSlots(raw: LegacyWorkflow): RollEntry[] {
  const keys = ['chara', 'artist', 'act'] as const
  const entries: RollEntry[] = []
  for (const key of keys) {
    const s = raw.slots?.[key]
    if (!s) continue
    entries.push(...normalizeEntries(s.entries))
  }
  return entries
}

export function normalizeWorkflow(raw: LegacyWorkflow, fileName?: string): RollWorkflow {
  const fallback =
    fileName?.replace(/\.json$/i, '') ||
    (typeof raw.id === 'string' ? raw.id : '') ||
    'workflow'
  const entries =
    raw.slots && typeof raw.slots === 'object'
      ? migrateFromSlots(raw)
      : normalizeEntries(raw.entries)

  return {
    name: sanitizeWorkflowName(
      typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback,
      sanitizeWorkflowName(fallback),
    ),
    entries,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

export const useRollWorkflowStore = defineStore('rollWorkflow', () => {
  const workflows = ref<RollWorkflow[]>([])
  const selectedName = ref('')
  const hydrated = ref(false)
  let hydratePromise: Promise<void> | null = null

  const selected = computed(
    () =>
      workflows.value.find((w) => w.name === selectedName.value) ?? workflows.value[0] ?? null,
  )

  const options = computed(() =>
    workflows.value.map((w) => ({ label: w.name, value: w.name })),
  )

  async function refresh(): Promise<void> {
    const list = (await window.api.rollWorkflows.list()) as RollWorkflow[]
    workflows.value = list.map((w) => normalizeWorkflow(w))
    if (!workflows.value.some((w) => w.name === selectedName.value)) {
      selectedName.value = workflows.value[0]?.name ?? ''
    }
  }

  async function hydrate(): Promise<void> {
    if (hydratePromise) return hydratePromise
    hydratePromise = (async () => {
      try {
        if (!hydrated.value) {
          const legacy = localStorage.getItem(STORAGE_KEY)
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy) as unknown
              if (Array.isArray(parsed) && parsed.length) {
                const normalized = parsed.map((item) =>
                  normalizeWorkflow(item as LegacyWorkflow),
                )
                await window.api.rollWorkflows.importList(normalized)
              }
            } catch {
              // ignore bad legacy
            }
            localStorage.removeItem(STORAGE_KEY)
          }
        }
        await refresh()
      } finally {
        hydrated.value = true
        hydratePromise = null
      }
    })()
    return hydratePromise
  }

  function select(name: string): void {
    if (workflows.value.some((w) => w.name === name)) selectedName.value = name
  }

  function getByName(name: string): RollWorkflow | null {
    const key = name.trim().toLowerCase()
    if (!key) return null
    return workflows.value.find((w) => w.name.trim().toLowerCase() === key) ?? null
  }

  async function create(name?: string): Promise<RollWorkflow> {
    await hydrate()
    const existing = workflows.value.map((w) => w.name)
    let base = sanitizeWorkflowName(name || 'workflow')
    if (existing.some((n) => n.toLowerCase() === base.toLowerCase())) {
      let i = 2
      while (existing.some((n) => n.toLowerCase() === `${base}_${i}`.toLowerCase())) i++
      base = `${base}_${i}`
    }
    const wf = createEmptyWorkflow(base)
    const saved = (await window.api.rollWorkflows.write(wf)) as RollWorkflow
    await refresh()
    selectedName.value = saved.name
    return normalizeWorkflow(saved)
  }

  async function duplicate(name: string): Promise<RollWorkflow | null> {
    await hydrate()
    const src = getByName(name)
    if (!src) return null
    const existing = workflows.value.map((w) => w.name)
    let nextName = sanitizeWorkflowName(`${src.name}_copy`)
    if (existing.some((n) => n.toLowerCase() === nextName.toLowerCase())) {
      let i = 2
      while (existing.some((n) => n.toLowerCase() === `${src.name}_copy_${i}`.toLowerCase())) i++
      nextName = `${src.name}_copy_${i}`
    }
    const copy: RollWorkflow = {
      ...JSON.parse(JSON.stringify(src)),
      name: nextName,
      updatedAt: Date.now(),
    }
    const saved = (await window.api.rollWorkflows.write(copy)) as RollWorkflow
    await refresh()
    selectedName.value = saved.name
    return normalizeWorkflow(saved)
  }

  async function remove(name: string): Promise<void> {
    await hydrate()
    if (workflows.value.length <= 1) return
    await window.api.rollWorkflows.remove(name)
    await refresh()
  }

  async function update(name: string, patch: Partial<RollWorkflow>): Promise<void> {
    await hydrate()
    const cur = getByName(name)
    if (!cur) return
    const next = normalizeWorkflow({
      ...cur,
      ...patch,
      name: cur.name,
      updatedAt: Date.now(),
    })
    await window.api.rollWorkflows.write(next)
    await refresh()
  }

  async function rename(oldName: string, newName: string): Promise<void> {
    await hydrate()
    const next = sanitizeWorkflowName(newName)
    if (!next || next === oldName) {
      if (next === oldName) return
      return
    }
    const saved = (await window.api.rollWorkflows.rename(oldName, next)) as RollWorkflow
    await refresh()
    selectedName.value = saved.name
  }

  return {
    workflows,
    selectedName,
    selectedId: selectedName,
    selected,
    options,
    hydrated,
    hydrate,
    refresh,
    select,
    getByName,
    getById: getByName,
    create,
    duplicate,
    remove,
    update,
    rename,
  }
})
