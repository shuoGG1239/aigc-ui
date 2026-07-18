<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import { sanitizeWorkflowName, type RollEntry } from '@/roll/workflow-types'
import { useRollWorkflowStore } from '@/stores/rollWorkflow'

const rollStore = useRollWorkflowStore()
const toast = useToast()

const draftName = ref('')
const newTag = ref('')
const newWeight = ref(1)
const listQuery = ref('')
const addInputRef = ref<HTMLInputElement | null>(null)

const wf = computed(() => rollStore.selected)

onMounted(() => {
  void rollStore.hydrate()
})

watch(
  () => rollStore.selected?.name,
  () => {
    draftName.value = rollStore.selected?.name ?? ''
  },
  { immediate: true },
)

const filteredWorkflows = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return rollStore.workflows
  return rollStore.workflows.filter((w) => w.name.toLowerCase().includes(q))
})

const entries = computed(() => wf.value?.entries ?? [])
const randomToken = computed(() => (wf.value ? `<random:${wf.value.name}>` : ''))

function onSelect(name: string): void {
  rollStore.select(name)
}

async function onCreate(): Promise<void> {
  await rollStore.create()
  toast.ok('已新建空白工作流')
  await nextTick()
  addInputRef.value?.focus()
}

async function onDuplicate(): Promise<void> {
  if (!wf.value) return
  await rollStore.duplicate(wf.value.name)
  toast.ok('已复制工作流')
}

async function onRemove(): Promise<void> {
  if (!wf.value) return
  if (rollStore.workflows.length <= 1) {
    toast.info('至少保留一个工作流')
    return
  }
  try {
    await rollStore.remove(wf.value.name)
    toast.ok('已删除')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function commitName(): Promise<void> {
  if (!wf.value) return
  const next = sanitizeWorkflowName(draftName.value)
  if (!next) {
    draftName.value = wf.value.name
    toast.error('名称只能包含字母、数字、_、-')
    return
  }
  if (next === wf.value.name) return
  try {
    await rollStore.rename(wf.value.name, next)
    toast.ok('已重命名')
  } catch (err) {
    draftName.value = wf.value.name
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function patchEntries(entries: RollEntry[]): Promise<void> {
  if (!wf.value) return
  await rollStore.update(wf.value.name, { entries })
}

async function updateEntry(index: number, patch: Partial<RollEntry>): Promise<void> {
  if (!wf.value) return
  const next = wf.value.entries.map((e, i) => {
    if (i !== index) return e
    const merged = { ...e, ...patch }
    if (typeof patch.tag === 'string') {
      // Save as typed (trim only); keep file text faithful.
      merged.tag = patch.tag.trim()
    }
    return merged
  })
  await patchEntries(next)
}

async function removeEntry(index: number): Promise<void> {
  if (!wf.value) return
  await patchEntries(wf.value.entries.filter((_, i) => i !== index))
}

function parseBulkTags(raw: string): string[] {
  const lines = raw.includes('\n') ? raw.split(/\r?\n/) : [raw]
  const out: string[] = []
  for (const line of lines) {
    const tag = line.trim()
    if (tag) out.push(tag)
  }
  return out
}

async function addEntry(): Promise<void> {
  if (!wf.value) return
  const tags = parseBulkTags(newTag.value)
  if (!tags.length) return
  const weight = Math.max(0, Number(newWeight.value) || 1)
  const added: RollEntry[] = tags.map((tag) => ({ tag, weight }))
  await patchEntries([...added, ...wf.value.entries])
  newTag.value = ''
  newWeight.value = 1
  if (tags.length > 1) toast.ok(`已添加 ${tags.length} 条`)
  await nextTick()
  addInputRef.value?.focus()
}

async function copyToken(): Promise<void> {
  if (!randomToken.value) return
  try {
    await navigator.clipboard.writeText(randomToken.value)
    toast.ok('已复制用法')
  } catch {
    toast.error('复制失败')
  }
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:roll-split" :default-width="240" :min-width="180" :max-width="360">
      <template #left>
        <section class="list-panel">
          <div class="panel-header">
            <div class="panel-title">工作流</div>
            <div class="form-actions" style="padding-top: 0">
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="新建空白"
                aria-label="新建空白"
                @click="onCreate"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
          <div class="panel-body roll-list-body">
            <input
              v-model="listQuery"
              class="input roll-list-search"
              type="search"
              placeholder="筛选…"
              spellcheck="false"
            />
            <div class="roll-list-scroll">
              <button
                v-for="item in filteredWorkflows"
                :key="item.name"
                type="button"
                class="roll-list-item"
                :class="{ active: item.name === rollStore.selectedName }"
                @click="onSelect(item.name)"
              >
                <span class="roll-list-name">{{ item.name }}</span>
                <span class="roll-list-meta">{{ item.entries.length }}</span>
              </button>
              <div v-if="!filteredWorkflows.length" class="roll-entry-empty">无匹配</div>
            </div>
          </div>
        </section>
      </template>

      <template #right>
        <section v-if="wf" class="detail-panel">
          <div class="panel-header roll-detail-header">
            <input
              v-model="draftName"
              class="input roll-name-input"
              type="text"
              title="唯一名称；Prompt 中写 &lt;random:name&gt; / &lt;random:name:0.8,0.9:2&gt;"
              spellcheck="false"
              @change="commitName"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
            <button
              type="button"
              class="roll-token-chip"
              :title="'点击复制；强度/数量写在表达式：&lt;random:' + wf.name + ':0.8,0.9:2,3&gt;'"
              @click="copyToken"
            >
              <code v-text="randomToken"></code>
            </button>
            <div class="form-actions" style="padding-top: 0">
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="复制工作流"
                aria-label="复制工作流"
                @click="onDuplicate"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4" />
                  <path
                    d="M3.5 10.5V3.8A1.3 1.3 0 0 1 4.8 2.5h6.7"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="删除工作流"
                aria-label="删除工作流"
                @click="onRemove"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 4.5h11M5.25 4.5V3.4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v1.1M4.25 4.5l.55 8.25h6.4l.55-8.25"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div class="panel-body roll-editor-body">
            <div class="roll-add-row">
              <input
                ref="addInputRef"
                v-model="newTag"
                class="input"
                type="text"
                placeholder="添加 tag（Enter；多行粘贴批量）"
                title="单行添加；粘贴多行可批量添加"
                spellcheck="false"
                @keydown.enter.prevent="addEntry"
              />
              <input
                v-model.number="newWeight"
                class="input roll-entry-weight"
                type="number"
                min="0"
                step="1"
                title="权重"
                @keydown.enter.prevent="addEntry"
              />
              <button type="button" class="btn btn-primary btn-icon" title="添加" aria-label="添加" @click="addEntry">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>
            </div>

            <div class="roll-entry-table">
              <div class="roll-entry-head">
                <span>Tag</span>
                <span title="抽样权重；0=禁用">权重</span>
                <span></span>
              </div>
              <div class="roll-entry-list">
                <div
                  v-for="(entry, index) in entries"
                  :key="index"
                  class="roll-entry-row"
                  :class="{ 'is-off': entry.weight <= 0 }"
                >
                  <input
                    class="input"
                    type="text"
                    :value="entry.tag"
                    spellcheck="false"
                    @change="updateEntry(index, { tag: ($event.target as HTMLInputElement).value })"
                  />
                  <input
                    class="input roll-entry-weight"
                    type="number"
                    min="0"
                    step="1"
                    :value="entry.weight"
                    @change="
                      updateEntry(index, {
                        weight: Math.max(0, Number(($event.target as HTMLInputElement).value) || 0),
                      })
                    "
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title="删除"
                    aria-label="删除"
                    @click="removeEntry(index)"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 4.5h11M5.25 4.5V3.4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v1.1M4.25 4.5l.55 8.25h6.4l.55-8.25"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <div v-if="!entries.length" class="roll-entry-empty">暂无条目，在上方添加</div>
              </div>
            </div>
          </div>
        </section>
        <section v-else class="detail-panel">
          <div class="panel-body">
            <div class="empty-state">
              <div class="title">尚无工作流</div>
              <div class="hint">点击左上角新建</div>
            </div>
          </div>
        </section>
      </template>
    </SplitPane>
  </div>
</template>
