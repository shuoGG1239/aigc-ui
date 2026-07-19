<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { IconTrash } from '@/components/icons'
import PromptPoolListPanel from '@/components/prompt-pool/PromptPoolListPanel.vue'
import PromptPoolPreviewModal from '@/components/prompt-pool/PromptPoolPreviewModal.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import { nextPoolPrompt } from '@/prompt/prompt-pool-engine'
import { isProgramPoolName } from '@shared/program-pools'
import {
  isLockedPool,
  sanitizePoolName,
  type PromptPoolEntry,
} from '@shared/prompt-pool-types'
import { usePromptPoolStore } from '@/stores/prompt-pool'
import { useTxt2ImgStore } from '@/stores/txt2img'

const poolStore = usePromptPoolStore()
const txt2img = useTxt2ImgStore()
const toast = useToast()

const draftName = ref('')
const nameEditing = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const entryQuery = ref('')
const entryListRef = ref<HTMLElement | null>(null)
const previewModalRef = ref<InstanceType<typeof PromptPoolPreviewModal> | null>(null)
const previewLoading = ref(false)

const pool = computed(() => poolStore.selected)

onMounted(() => {
  void poolStore.hydrate()
})

watch(
  () => poolStore.selected?.name,
  () => {
    draftName.value = poolStore.selected?.name ?? ''
    entryQuery.value = ''
    nameEditing.value = false
  },
  { immediate: true },
)

const entries = computed(() => pool.value?.entries ?? [])
const isProgram = computed(() => (pool.value ? isProgramPoolName(pool.value.name) : false))
const locked = computed(() => (pool.value ? isLockedPool(pool.value) : false))

const filteredEntries = computed(() => {
  const q = entryQuery.value.trim().toLowerCase()
  const list = entries.value.map((entry, index) => ({ entry, index }))
  if (!q) return list
  return list.filter(({ entry }) => entry.prompt.toLowerCase().includes(q))
})

const poolToken = computed(() => (pool.value ? `<pool:${pool.value.name}>` : ''))

function onSelect(name: string): void {
  poolStore.select(name)
}

async function onCreate(): Promise<void> {
  await poolStore.create()
  toast.ok('已新建空白提示词池')
}

function onRunSample(): void {
  if (!pool.value) return
  const sampled = nextPoolPrompt(pool.value, txt2img.form.family).trim()
  if (!sampled) {
    toast.error('未产出内容（检查条目/占比）')
    return
  }
  toast.info(sampled, 8000)
}

async function onDuplicate(): Promise<void> {
  if (!pool.value || isProgram.value) return
  try {
    await poolStore.duplicate(pool.value.name)
    toast.ok('已复制提示词池')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onRemove(): Promise<void> {
  if (!pool.value) return
  if (locked.value) {
    toast.info('内置提示词池不可删除（可先复制再改）')
    return
  }
  if (poolStore.pools.length <= 1) {
    toast.info('至少保留一个提示词池')
    return
  }
  try {
    await poolStore.remove(pool.value.name)
    toast.ok('已删除')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function startEditName(): Promise<void> {
  if (!pool.value || locked.value) {
    toast.info('内置提示词池不可重命名（可先复制再改）')
    return
  }
  nameEditing.value = true
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

async function commitName(): Promise<void> {
  if (!pool.value) return
  if (!nameEditing.value) return
  if (locked.value) {
    draftName.value = pool.value.name
    nameEditing.value = false
    return
  }
  const next = sanitizePoolName(draftName.value)
  if (!next) {
    draftName.value = pool.value.name
    nameEditing.value = false
    toast.error('名称只能包含字母、数字、_、-')
    return
  }
  if (next === pool.value.name) {
    nameEditing.value = false
    return
  }
  try {
    await poolStore.rename(pool.value.name, next)
    toast.ok('已重命名')
  } catch (err) {
    draftName.value = pool.value.name
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    nameEditing.value = false
  }
}

function cancelEditName(): void {
  if (!pool.value) return
  draftName.value = pool.value.name
  nameEditing.value = false
}

async function patchEntries(entries: PromptPoolEntry[]): Promise<void> {
  if (!pool.value) return
  await poolStore.update(pool.value.name, { entries })
}

async function updateEntry(index: number, patch: Partial<PromptPoolEntry>): Promise<void> {
  if (!pool.value) return
  const next = pool.value.entries.map((e, i) => {
    if (i !== index) return e
    const merged = { ...e, ...patch }
    if (typeof patch.prompt === 'string') {
      merged.prompt = patch.prompt.trim()
    }
    return merged
  })
  await patchEntries(next)
}

async function removeEntry(index: number): Promise<void> {
  if (!pool.value) return
  await patchEntries(pool.value.entries.filter((_, i) => i !== index))
}

function parseBulkPrompts(raw: string): string[] {
  const lines = raw.includes('\n') ? raw.split(/\r?\n/) : [raw]
  const out: string[] = []
  for (const line of lines) {
    const prompt = line.trim()
    if (prompt) out.push(prompt)
  }
  return out
}

function focusEntryPrompt(index: number): void {
  const row = entryListRef.value?.querySelector(`[data-entry-index="${index}"]`) as HTMLElement | null
  const input = row?.querySelector('input[type="text"]') as HTMLInputElement | null
  input?.focus()
  input?.select()
}

async function addEntry(): Promise<void> {
  if (!pool.value) return
  entryQuery.value = ''
  await patchEntries([{ prompt: '', weight: 1 }, ...pool.value.entries])
  await nextTick()
  focusEntryPrompt(0)
}

async function onPromptPaste(index: number, event: ClipboardEvent): Promise<void> {
  if (!pool.value) return
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text.includes('\n')) return
  const prompts = parseBulkPrompts(text)
  if (prompts.length <= 1) return
  event.preventDefault()
  const weight = pool.value.entries[index]?.weight ?? 1
  const added: PromptPoolEntry[] = prompts.map((prompt) => ({ prompt, weight }))
  const next = [...pool.value.entries]
  next.splice(index, 1, ...added)
  await patchEntries(next)
  toast.ok(`已添加 ${prompts.length} 条`)
}

async function copyToken(): Promise<void> {
  if (!poolToken.value) return
  try {
    await navigator.clipboard.writeText(poolToken.value)
    toast.ok('已复制用法')
  } catch {
    toast.error('复制失败')
  }
}

function onPreviewEntry(prompt: string): void {
  void previewModalRef.value?.open(prompt)
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:pool-split" :default-width="240" :min-width="180" :max-width="360">
      <template #left>
        <PromptPoolListPanel
          :pools="poolStore.pools"
          :selected-name="poolStore.selectedName"
          @select="onSelect"
          @create="onCreate"
        />
      </template>

      <template #right>
        <section v-if="pool" class="detail-panel">
          <div class="panel-header pool-detail-header">
            <div class="pool-name-field" :class="{ 'is-editing': nameEditing }">
              <input
                ref="nameInputRef"
                v-model="draftName"
                class="pool-name-input"
                type="text"
                :readonly="!nameEditing"
                :size="Math.max(draftName.length, 2)"
                :title="
                  isProgram
                    ? '程序池名称只读'
                    : locked
                      ? '内置池名称只读；可复制后改'
                      : '唯一名称；Prompt 中写 &lt;pool:name&gt; / &lt;pool:name:2:0.8|0.9&gt;'
                "
                spellcheck="false"
                @blur="commitName"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                @keydown.escape.prevent="cancelEditName"
              />
              <button
                v-if="!locked && !nameEditing"
                type="button"
                class="pool-name-edit"
                title="编辑名称"
                aria-label="编辑名称"
                @mousedown.prevent
                @click="startEditName"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M9.5 3.5l3 3M3 13l.7-3.2L11.8 1.7a1.5 1.5 0 0 1 2.1 2.1L5.8 12.1 3 13z"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
            <button
              type="button"
              class="pool-token"
              :title="'复制 &lt;pool:' + pool.name + '&gt; 到剪贴板'"
              @click="copyToken"
            >
              <code v-text="poolToken"></code>
              <svg class="pool-token-copy" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="5.5" y="5.5" width="7" height="7" rx="1.2" stroke="currentColor" stroke-width="1.4" />
                <path
                  d="M3.5 10.5V3.8A1.3 1.3 0 0 1 4.8 2.5h6.7"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <div v-if="!isProgram" class="form-actions" style="padding-top: 0">
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="复制提示词池"
                aria-label="复制提示词池"
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
                :disabled="locked"
                :title="locked ? '内置池不可删除' : '删除提示词池'"
                aria-label="删除提示词池"
                @click="onRemove"
              >
                <IconTrash />
              </button>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-icon pool-run"
              title="抽样一次并显示结果"
              aria-label="运行抽样"
              @click="onRunSample"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4.5 3.2v9.6L13 8 4.5 3.2z"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>

          <div v-if="isProgram" class="panel-body pool-editor-body">
            <div class="empty-state">
              <div class="title">程序池</div>
              <div class="hint">内部逻辑不开放编辑；在 Prompt 中使用上方标签即可抽样。</div>
            </div>
          </div>
          <div v-else class="panel-body pool-editor-body">
            <div class="pool-entry-table">
              <div class="pool-entry-head">
                <span class="pool-entry-head-eye" aria-hidden="true"></span>
                <div class="pool-entry-head-prompt">
                  <span class="pool-entry-head-title">Prompt</span>
                  <label class="pool-search pool-entry-head-search">
                    <svg class="pool-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="4.25" stroke="currentColor" stroke-width="1.5" />
                      <path d="M10.2 10.2L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                    <input
                      v-model="entryQuery"
                      class="input pool-search-input"
                      type="search"
                      placeholder="搜索…"
                      spellcheck="false"
                    />
                  </label>
                </div>
                <span title="相对抽选占比；越大越容易被抽到，0=禁用">占比</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title="新建条目（多行粘贴可批量）"
                  aria-label="新建条目"
                  @click="addEntry"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <div ref="entryListRef" class="pool-entry-list">
                <div
                  v-for="{ entry, index } in filteredEntries"
                  :key="index"
                  class="pool-entry-row"
                  :class="{ 'is-off': entry.weight <= 0 }"
                  :data-entry-index="index"
                >
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon pool-entry-preview"
                    title="预览图"
                    aria-label="预览图"
                    :disabled="previewLoading || !entry.prompt.trim()"
                    @click="onPreviewEntry(entry.prompt)"
                  >
                    <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                      <path
                        d="M511.5 203c150.289 0 286.149 81.46 407.028 241.344l4.042 5.383 1.233 1.67 1.595 2.188 1.764 2.444 2.812 3.937 3.491 4.936L937 469.94l5.948 8.54 4.854 7.012 5.77 8.374a32 32 0 0 1 0.263 35.876l-0.265 0.391-8.979 13.01-6.205 8.925-4.055 5.79-3.635 5.151-2.096 2.945-2.698 3.76-1.91 2.626-1.489 2.021-0.586 0.787C800.19 738.008 663.195 821 511.5 821c-149.696 0-285.077-80.82-405.598-239.456l-3.843-5.092-1.918-2.589-2.195-3.01-3.357-4.673-2.841-3.997-4.219-5.987-6.391-9.15-8.727-12.602-3.012-4.37a32 32 0 0 1-0.336-35.795l0.263-0.392 8.24-12.036 5.402-7.835 3.354-4.826 2.758-3.925 1.676-2.353 0.484-0.671C215.41 290.542 355.702 203 511.5 203z m0 63.931c-134.122 0-257.796 77.938-371.65 237.278l-3.447 4.853-2.061 2.938 2.061 2.938c112.472 159.308 234.554 238.866 366.855 242.033l4.012 0.072 4.23 0.026c134.122 0 257.796-77.938 371.65-237.278l3.447-4.853 2.06-2.938-2.06-2.938C774.125 349.754 652.043 270.196 519.742 267.029l-4.012-0.072-4.23-0.026z m0.5 108.402c75.11 0 136 60.89 136 136 0 75.111-60.89 136-136 136s-136-60.889-136-136c0-75.11 60.89-136 136-136z m0 64c-39.765 0-72 32.236-72 72 0 39.765 32.235 72 72 72s72-32.235 72-72c0-39.764-32.235-72-72-72z"
                      />
                    </svg>
                  </button>
                  <input
                    class="input"
                    type="text"
                    :value="entry.prompt"
                    placeholder="输入 prompt…"
                    spellcheck="false"
                    @paste="onPromptPaste(index, $event)"
                    @change="updateEntry(index, { prompt: ($event.target as HTMLInputElement).value })"
                  />
                  <input
                    class="input pool-entry-weight"
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
                    <IconTrash />
                  </button>
                </div>
                <div v-if="!entries.length" class="pool-entry-empty">暂无条目，点击右上角 + 新建</div>
                <div v-else-if="!filteredEntries.length" class="pool-entry-empty">无匹配</div>
              </div>
            </div>
          </div>
        </section>
        <section v-else class="detail-panel">
          <div class="panel-body">
            <div class="empty-state">
              <div class="title">尚无提示词池</div>
              <div class="hint">点击左上角新建</div>
            </div>
          </div>
        </section>
      </template>
    </SplitPane>

    <PromptPoolPreviewModal
      ref="previewModalRef"
      @loading-change="previewLoading = $event"
    />
  </div>
</template>
