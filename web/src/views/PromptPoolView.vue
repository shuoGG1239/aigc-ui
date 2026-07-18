<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import { nextPoolPrompt } from '@/prompt/prompt-pool-engine'
import { isProgramPoolName } from '@/prompt/program-pools'
import {
  isLockedPool,
  sanitizePoolName,
  type PromptPoolEntry,
} from '@/prompt/prompt-pool-types'
import { usePromptPoolStore } from '@/stores/promptPool'
import { useTxt2ImgStore } from '@/stores/txt2img'

const poolStore = usePromptPoolStore()
const txt2img = useTxt2ImgStore()
const toast = useToast()

const draftName = ref('')
const nameEditing = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)
const listQuery = ref('')
const entryQuery = ref('')
const entryListRef = ref<HTMLElement | null>(null)
const previewOpen = ref(false)
const previewLoading = ref(false)
const preview = ref<{ prompt: string; images: PromptPreviewImage[] } | null>(null)

const pool = computed(() => poolStore.selected)

function onPreviewKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && previewOpen.value) closePreview()
}

onMounted(() => {
  void poolStore.hydrate()
  window.addEventListener('keydown', onPreviewKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onPreviewKeydown)
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

const filteredPools = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return poolStore.pools
  return poolStore.pools.filter((p) => p.name.toLowerCase().includes(q))
})

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

function poolListMeta(item: { name: string; entries: unknown[] }): string {
  if (isProgramPoolName(item.name)) return '—'
  return String(item.entries.length)
}

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
    toast.error('未产出内容（检查条目/权重）')
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

function closePreview(): void {
  previewOpen.value = false
  preview.value = null
}

async function onPreviewEntry(prompt: string): Promise<void> {
  const text = prompt.trim()
  if (!text) {
    toast.info('空 prompt')
    return
  }
  if (previewLoading.value) return
  previewLoading.value = true
  try {
    const result = await window.api.promptPreview.resolve(text)
    if (!result.ok) {
      toast.info(result.reason === 'no_dir' ? '请先在设置中配置预览图目录' : '未找到预览图')
      return
    }
    preview.value = {
      prompt: text,
      images: result.images,
    }
    previewOpen.value = true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    previewLoading.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:pool-split" :default-width="240" :min-width="180" :max-width="360">
      <template #left>
        <section class="list-panel">
          <div class="panel-header pool-list-header">
            <div class="panel-title">提示词池</div>
            <label class="pool-search pool-list-header-search">
              <svg class="pool-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.25" stroke="currentColor" stroke-width="1.5" />
                <path d="M10.2 10.2L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <input
                v-model="listQuery"
                class="input pool-search-input"
                type="search"
                placeholder="搜索…"
                spellcheck="false"
              />
            </label>
            <button
              type="button"
              class="btn btn-ghost btn-icon pool-list-create"
              title="新建"
              aria-label="新建"
              @click="onCreate"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="panel-body pool-list-body">
            <div class="pool-list-scroll">
              <button
                v-for="item in filteredPools"
                :key="item.name"
                type="button"
                class="pool-list-item"
                :class="{ active: item.name === poolStore.selectedName }"
                @click="onSelect(item.name)"
              >
                <span class="pool-list-name">
                  {{ item.name }}
                  <span v-if="isProgramPoolName(item.name)" class="pool-builtin-tag">程序</span>
                  <span v-else-if="item.builtin" class="pool-builtin-tag">内置</span>
                </span>
                <span class="pool-list-meta">{{ poolListMeta(item) }}</span>
              </button>
              <div v-if="!filteredPools.length" class="pool-entry-empty">无匹配</div>
            </div>
          </div>
        </section>
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
                      : '唯一名称；Prompt 中写 &lt;pool:name&gt; / &lt;pool:name:0.8,0.9:2&gt;'
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
                <span title="抽样权重；0=禁用">权重</span>
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
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M1.75 8s2.25-3.75 6.25-3.75S14.25 8 14.25 8s-2.25 3.75-6.25 3.75S1.75 8 1.75 8z"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linejoin="round"
                      />
                      <circle cx="8" cy="8" r="1.75" stroke="currentColor" stroke-width="1.4" />
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

    <Teleport to="body">
      <div
        v-if="previewOpen && preview"
        class="pool-preview-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="提示词预览图"
        @click.self="closePreview"
      >
        <div class="pool-preview-card">
          <div class="pool-preview-header">
            <code class="pool-preview-name" :title="preview.prompt">{{ preview.prompt }}</code>
            <span class="pool-preview-count">{{ preview.images.length }} 张</span>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="关闭"
              aria-label="关闭"
              @click="closePreview"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="pool-preview-grid" :class="{ 'is-single': preview.images.length === 1 }">
            <figure v-for="img in preview.images" :key="img.path" class="pool-preview-item">
              <img
                class="pool-preview-img"
                :src="img.dataUrl"
                :alt="img.filename"
                draggable="false"
                @dragstart.prevent
              />
              <figcaption class="pool-preview-file" :title="img.filename">{{ img.filename }}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
