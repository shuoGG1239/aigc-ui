<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import { IconShredder } from '@/components/icons'
import ModelSelect from '@/components/common/ModelSelect.vue'
import PromptTextarea from '@/components/common/PromptTextarea.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import type { ModelFamily } from '@/models/family'
import { nextLiteralPrompt, nextPoolPrompt } from '@/prompt/prompt-pool-engine'
import { isProgramPoolName } from '@/prompt/program-pools'
import type { PromptPool, PromptPoolEntry } from '@/prompt/prompt-pool-types'
import { usePromptPoolStore } from '@/stores/promptPool'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { replaceEditableValue } from '@/utils/editable-text'
import { fuzzyMatches, fuzzyParts } from '@/utils/fuzzy'
import { parseImageMeta } from '@/utils/image-meta'
import { formatHms, promptSummary } from '@/utils/param-history'
import { formatPromptByFamily } from '@/utils/prompt-format'
import { parseWorkflowParams } from '@/utils/workflow-params'
import {
  CLIP_TYPE_OPTIONS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
  WEIGHT_DTYPE_OPTIONS,
} from '@/utils/select-options'

const store = useTxt2ImgStore()
const poolStore = usePromptPoolStore()
const toast = useToast()
const historyOpen = ref(false)
const historyBtnRef = ref<HTMLButtonElement | null>(null)
const historyMenuStyle = ref<Record<string, string>>({})
/** Type-ahead filter via hidden trap (no visible search box). */
const historyQuery = ref('')
const historyFilterRef = ref<HTMLInputElement | null>(null)
const randomOpen = ref(false)
const randomBtnRef = ref<HTMLButtonElement | null>(null)
const randomMenuStyle = ref<Record<string, string>>({})
const submenuPool = ref<string | null>(null)
const submenuStyle = ref<Record<string, string>>({})
/** Type-ahead filter via hidden trap (no visible search box). */
const menuQuery = ref('')
const menuFilterRef = ref<HTMLInputElement | null>(null)
let submenuCloseTimer: number | null = null
/** Last focused prompt field; dice inserts at saved caret. */
const focusedPromptField = ref<'prompt' | 'negativePrompt'>('prompt')
const promptFieldRef = ref<InstanceType<typeof PromptTextarea> | null>(null)
const negFieldRef = ref<InstanceType<typeof PromptTextarea> | null>(null)
/** null = insert at end of field. */
const promptCaret = ref<{ start: number; end: number } | null>(null)
const infoOpen = ref(false)
const infoRaw = ref('')
const infoSummary = ref<{
  source: string
  prompt: string
  negativePrompt: string
  size: string
  steps: string
  cfg: string
  sampler: string
  scheduler: string
  seed: string
  family: string
  model: string
  filename: string
  path: string
} | null>(null)
const previewDragOver = ref(false)
let previewDragDepth = 0

function taRef(field: 'prompt' | 'negativePrompt'): HTMLTextAreaElement | null {
  const comp = field === 'prompt' ? promptFieldRef.value : negFieldRef.value
  return comp?.getTextarea() ?? null
}

function savePromptCaret(field: 'prompt' | 'negativePrompt', el?: HTMLTextAreaElement | null): void {
  focusedPromptField.value = field
  const ta = el ?? taRef(field)
  if (!ta) return
  promptCaret.value = {
    start: ta.selectionStart ?? 0,
    end: ta.selectionEnd ?? 0,
  }
}

function onPromptFocus(field: 'prompt' | 'negativePrompt', e: FocusEvent): void {
  savePromptCaret(field, e.target as HTMLTextAreaElement)
}

function onPromptSelect(field: 'prompt' | 'negativePrompt', e?: Event): void {
  savePromptCaret(field, (e?.target as HTMLTextAreaElement | undefined) ?? null)
}

function onPromptBlur(field: 'prompt' | 'negativePrompt', e: FocusEvent): void {
  savePromptCaret(field, e.target as HTMLTextAreaElement)
}

function appendToFocusedPrompt(text: string): void {
  const field = focusedPromptField.value
  const piece = text.trim()
  if (!piece) return

  const ta = taRef(field)
  const cur = ta?.value ?? store.form[field]
  let start = promptCaret.value?.start ?? cur.length
  let end = promptCaret.value?.end ?? cur.length
  start = Math.max(0, Math.min(start, cur.length))
  end = Math.max(start, Math.min(end, cur.length))

  const left = cur.slice(0, start)
  const needComma = left.trim().length > 0 && !/,\s*$/.test(left)
  const insert = (needComma ? ', ' : '') + piece

  if (ta) {
    ta.focus()
    ta.setSelectionRange(start, end)
    // insertText joins the native undo stack (plain value assign does not).
    const ok = document.execCommand('insertText', false, insert)
    if (ok) {
      store.form[field] = ta.value
      const newPos = ta.selectionStart ?? start + insert.length
      promptCaret.value = { start: newPos, end: newPos }
      return
    }
  }

  const right = cur.slice(end)
  store.form[field] = left + insert + right
  const newPos = left.length + insert.length
  promptCaret.value = { start: newPos, end: newPos }
  void nextTick(() => {
    const el = taRef(field)
    if (!el) return
    el.focus()
    el.setSelectionRange(newPos, newPos)
  })
}

/** Write prompt/negative via native undo stack when the textarea exists. */
function setPromptField(field: 'prompt' | 'negativePrompt', next: string): void {
  if (store.form[field] === next) return
  const ta = taRef(field)
  if (ta && replaceEditableValue(ta, next)) {
    store.form[field] = ta.value
    return
  }
  store.form[field] = next
}

function onFormatField(field: 'prompt' | 'negativePrompt'): void {
  const result = formatPromptByFamily(store.form[field], {
    family: store.form.family,
    unetModel: store.form.unetModel,
    checkpoint: store.form.checkpoint,
  })
  if (!result.changed) {
    toast.info('已是规范格式')
    return
  }
  setPromptField(field, result.prompt)
  toast.ok(result.kind === 'anima' ? '已按 Anima 规范格式化' : '已按 SDXL 规范格式化')
}

function onFormatParams(): void {
  onFormatField(focusedPromptField.value)
}

/** Apply parsed form; prompt fields keep Ctrl+Z. */
async function applyParsedForm(next: ReturnType<typeof parseWorkflowParams>): Promise<void> {
  const prompt = next.prompt
  const negativePrompt = next.negativePrompt
  store.applyForm({
    ...next,
    prompt: store.form.prompt,
    negativePrompt: store.form.negativePrompt,
  })
  await nextTick()
  setPromptField('prompt', prompt)
  setPromptField('negativePrompt', negativePrompt)
}

function onFamilyChange(family: ModelFamily): void {
  store.setFamily(family)
}

function updateHistoryMenuPosition(): void {
  const el = historyBtnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 360
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
  historyMenuStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${width}px`,
  }
}

function updateRandomMenuPosition(): void {
  const el = randomBtnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 240
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
  randomMenuStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${width}px`,
  }
}

async function toggleHistory(): Promise<void> {
  randomOpen.value = false
  menuQuery.value = ''
  closeSubmenu()
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) {
    historyQuery.value = ''
    await nextTick()
    updateHistoryMenuPosition()
    historyFilterRef.value?.focus()
  } else {
    historyQuery.value = ''
  }
}

const filteredHistory = computed(() => {
  const q = historyQuery.value
  const list = store.paramHistory
  if (!q.trim()) return list
  return list.filter(
    (e) => fuzzyMatches(e.form.prompt, q) || fuzzyMatches(e.form.negativePrompt || '', q),
  )
})

function onHistoryFilterInput(e: Event): void {
  historyQuery.value = (e.target as HTMLInputElement).value
}

function syncHistoryFilterInput(): void {
  const el = historyFilterRef.value
  if (el && el.value !== historyQuery.value) el.value = historyQuery.value
}

function onHistoryFilterBlur(): void {
  if (!historyOpen.value) return
  requestAnimationFrame(() => {
    if (historyOpen.value) historyFilterRef.value?.focus()
  })
}

function poolMenuEntries(pool: PromptPool): PromptPoolEntry[] {
  if (isProgramPoolName(pool.name)) return []
  return pool.entries.filter((e) => e.prompt.trim())
}

function filterPoolEntries(pool: PromptPool, entries: PromptPoolEntry[], query: string): PromptPoolEntry[] {
  if (!query.trim()) return entries
  const matched = entries.filter((e) => fuzzyMatches(e.prompt, query))
  if (matched.length) return matched
  if (fuzzyMatches(pool.name, query)) return entries
  return []
}

function poolMatchesQuery(pool: PromptPool, query: string): boolean {
  if (!query.trim()) return true
  if (fuzzyMatches(pool.name, query)) return true
  return poolMenuEntries(pool).some((e) => fuzzyMatches(e.prompt, query))
}

const filteredPools = computed(() => {
  const q = menuQuery.value
  const list = poolStore.pools
  if (!q.trim()) return list
  return list.filter((p) => poolMatchesQuery(p, q))
})

const filteredSubmenuEntries = computed(() => {
  if (!submenuPool.value) return []
  const pool = poolStore.getByName(submenuPool.value)
  if (!pool) return []
  return filterPoolEntries(pool, poolMenuEntries(pool), menuQuery.value)
})

function clearSubmenuCloseTimer(): void {
  if (submenuCloseTimer != null) {
    window.clearTimeout(submenuCloseTimer)
    submenuCloseTimer = null
  }
}

function closeSubmenu(): void {
  clearSubmenuCloseTimer()
  submenuPool.value = null
}

function scheduleCloseSubmenu(): void {
  clearSubmenuCloseTimer()
  submenuCloseTimer = window.setTimeout(() => closeSubmenu(), 140)
}

function openSubmenuFor(pool: PromptPool, anchor: HTMLElement): void {
  const entries = filterPoolEntries(pool, poolMenuEntries(pool), menuQuery.value)
  if (!entries.length) {
    closeSubmenu()
    return
  }
  clearSubmenuCloseTimer()
  submenuPool.value = pool.name
  const rect = anchor.getBoundingClientRect()
  const width = 260
  const maxH = 280
  let left = rect.left - width - 4
  if (left < 8) left = Math.min(rect.right + 4, window.innerWidth - width - 8)
  let top = rect.top
  if (top + Math.min(maxH, entries.length * 36 + 8) > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - maxH - 8)
  }
  submenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  }
}

function onPoolRowEnter(pool: PromptPool, e: MouseEvent): void {
  openSubmenuFor(pool, e.currentTarget as HTMLElement)
}

function onPoolRowLeave(): void {
  scheduleCloseSubmenu()
}

async function toggleRandomMenu(): Promise<void> {
  historyOpen.value = false
  await poolStore.hydrate()
  if (!poolStore.pools.length) {
    toast.info('请先在「提示词池」页创建')
    return
  }
  randomOpen.value = !randomOpen.value
  if (randomOpen.value) {
    menuQuery.value = ''
    await nextTick()
    updateRandomMenuPosition()
    menuFilterRef.value?.focus()
  } else {
    menuQuery.value = ''
    closeSubmenu()
  }
}

function onMenuFilterInput(e: Event): void {
  menuQuery.value = (e.target as HTMLInputElement).value
}

function syncMenuFilterInput(): void {
  const el = menuFilterRef.value
  if (el && el.value !== menuQuery.value) el.value = menuQuery.value
}

function onMenuFilterBlur(): void {
  if (!randomOpen.value) return
  requestAnimationFrame(() => {
    if (randomOpen.value) menuFilterRef.value?.focus()
  })
}

function finishAppendSample(sampled: string): void {
  const text = sampled.trim()
  if (!text) {
    toast.error('该提示词池未产出内容（检查条目/占比）')
    return
  }
  appendToFocusedPrompt(text)
  randomOpen.value = false
  closeSubmenu()
  const target = focusedPromptField.value === 'negativePrompt' ? 'Negative' : 'Prompt'
  toast.ok(`已追加到 ${target}`)
}

function onInsertPoolToken(name: string): void {
  finishAppendSample(`<pool:${name}>`)
}

function onSamplePromptPool(name: string): void {
  const pool = poolStore.getByName(name)
  if (!pool) return
  finishAppendSample(nextPoolPrompt(pool, store.form.family))
}

function onPickPromptEntry(prompt: string): void {
  finishAppendSample(nextLiteralPrompt(prompt, store.form.family))
}

function onRestoreHistory(fingerprint: string): void {
  if (store.restoreHistory(fingerprint)) {
    historyOpen.value = false
    toast.ok('已恢复历史参数')
  }
}

async function onApplyClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (!text.trim()) {
      toast.error('剪贴板为空')
      return
    }
    const next = parseWorkflowParams(text, {
      preferFamily: store.form.family,
      base: store.form,
    })
    await applyParsedForm(next)
    toast.ok('已从剪贴板应用参数')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onHistoryDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (historyBtnRef.value?.contains(target)) return
  const menu = document.querySelector('.param-history-menu')
  if (menu?.contains(target)) return
  historyOpen.value = false
}

function onRandomDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (randomBtnRef.value?.contains(target)) return
  const menu = document.querySelector('.random-pick-menu')
  if (menu?.contains(target)) return
  const sub = document.querySelector('.random-pick-submenu')
  if (sub?.contains(target)) return
  randomOpen.value = false
  menuQuery.value = ''
  closeSubmenu()
}

function onPopupKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (randomOpen.value && menuQuery.value) {
      e.preventDefault()
      menuQuery.value = ''
      syncMenuFilterInput()
      return
    }
    if (historyOpen.value && historyQuery.value) {
      e.preventDefault()
      historyQuery.value = ''
      syncHistoryFilterInput()
      return
    }
    historyOpen.value = false
    randomOpen.value = false
    menuQuery.value = ''
    historyQuery.value = ''
    closeSubmenu()
  }
}

watch(menuQuery, () => {
  syncMenuFilterInput()
  if (!submenuPool.value) return
  if (!filteredPools.value.some((p) => p.name === submenuPool.value)) {
    closeSubmenu()
    return
  }
  if (!filteredSubmenuEntries.value.length) closeSubmenu()
})

watch(historyQuery, () => {
  syncHistoryFilterInput()
})

watch(historyOpen, (open) => {
  if (open) {
    window.addEventListener('resize', updateHistoryMenuPosition)
    window.addEventListener('scroll', updateHistoryMenuPosition, true)
    document.addEventListener('mousedown', onHistoryDocClick)
    document.addEventListener('keydown', onPopupKey)
  } else {
    historyQuery.value = ''
    window.removeEventListener('resize', updateHistoryMenuPosition)
    window.removeEventListener('scroll', updateHistoryMenuPosition, true)
    document.removeEventListener('mousedown', onHistoryDocClick)
    if (!randomOpen.value) document.removeEventListener('keydown', onPopupKey)
  }
})

watch(randomOpen, (open) => {
  if (open) {
    window.addEventListener('resize', updateRandomMenuPosition)
    window.addEventListener('scroll', updateRandomMenuPosition, true)
    document.addEventListener('mousedown', onRandomDocClick)
    document.addEventListener('keydown', onPopupKey)
  } else {
    menuQuery.value = ''
    closeSubmenu()
    window.removeEventListener('resize', updateRandomMenuPosition)
    window.removeEventListener('scroll', updateRandomMenuPosition, true)
    document.removeEventListener('mousedown', onRandomDocClick)
    if (!historyOpen.value) document.removeEventListener('keydown', onPopupKey)
  }
})

onBeforeUnmount(() => {
  closeSubmenu()
  window.removeEventListener('resize', updateHistoryMenuPosition)
  window.removeEventListener('scroll', updateHistoryMenuPosition, true)
  window.removeEventListener('resize', updateRandomMenuPosition)
  window.removeEventListener('scroll', updateRandomMenuPosition, true)
  document.removeEventListener('mousedown', onHistoryDocClick)
  document.removeEventListener('mousedown', onRandomDocClick)
  document.removeEventListener('keydown', onPopupKey)
})

let offFormat: (() => void) | undefined
onMounted(() => {
  offFormat = window.api.txt2img.onFormat((field) => onFormatField(field))
  void poolStore.hydrate()
})
onUnmounted(() => {
  offFormat?.()
})

async function onGenerate(): Promise<void> {
  try {
    const count = await store.generate()
    toast.ok(count > 1 ? `生成完成 ${count} 张` : `生成完成 (seed=${store.lastSeed})`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onCancel(): Promise<void> {
  await store.cancel()
  toast.info('已请求取消')
}

async function onOpenPreviewFolder(): Promise<void> {
  try {
    const path = store.selectedImage?.path
    if (path) {
      await window.api.shell.showItemInFolder(path)
    } else {
      await window.api.settings.openOutputDir()
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onApplyImageMeta(): Promise<void> {
  const path = store.selectedImage?.path
  if (!path) return
  try {
    const info = await window.api.image.readMetadata(path)
    const next = parseWorkflowParams(JSON.stringify(info), {
      preferFamily: store.form.family,
      base: store.form,
    })
    await applyParsedForm(next)
    toast.ok('已应用图片到参数')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onToggleImageInfo(): Promise<void> {
  if (infoOpen.value) {
    infoOpen.value = false
    return
  }
  const img = store.selectedImage
  if (!img) return
  try {
    const info = await window.api.image.readMetadata(img.path)
    const payload = { path: img.path, filename: img.filename, ...info }
    infoRaw.value = JSON.stringify(payload, null, 2)

    const { meta } = parseImageMeta(info)
    const sourceLabel =
      meta.source === 'comfyui'
        ? 'ComfyUI'
        : meta.source === 'a1111'
          ? 'A1111'
          : meta.source === 'novelai'
            ? 'NovelAI'
            : 'Unknown'
    infoSummary.value = {
      source: sourceLabel,
      prompt: meta.prompt.trim() || '—',
      negativePrompt: meta.negativePrompt.trim() || '—',
      size:
        meta.width != null && meta.height != null ? `${meta.width} × ${meta.height}` : '—',
      steps: meta.steps != null ? String(meta.steps) : '—',
      cfg: meta.cfg != null ? String(meta.cfg) : '—',
      sampler: meta.sampler || '—',
      scheduler: meta.scheduler || '—',
      seed: meta.seed.trim() ? meta.seed : '—',
      family: meta.family ? meta.family.toUpperCase() : '—',
      model: meta.model || '—',
      filename: img.filename,
      path: img.path,
    }

    infoOpen.value = true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

watch(
  () => store.selectedImage?.path,
  () => {
    infoOpen.value = false
    infoSummary.value = null
    infoRaw.value = ''
  },
)

function onPreviewDragEnter(e: DragEvent): void {
  e.preventDefault()
  previewDragDepth += 1
  previewDragOver.value = true
}

function onPreviewDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  previewDragOver.value = true
}

function onPreviewDragLeave(e: DragEvent): void {
  e.preventDefault()
  previewDragDepth -= 1
  if (previewDragDepth <= 0) {
    previewDragDepth = 0
    previewDragOver.value = false
  }
}

async function onPreviewDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  previewDragDepth = 0
  previewDragOver.value = false

  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) {
    toast.error('请拖入 PNG 图片或文件夹')
    return
  }

  try {
    const images: { path: string; filename: string; dataUrl: string }[] = []
    const errors: string[] = []
    for (const file of files) {
      const targetPath = window.api.getPathForFile(file)
      if (!targetPath) {
        errors.push('无法读取拖入路径')
        continue
      }
      try {
        const loaded = await window.api.image.loadPreviewFromPath(targetPath, 10)
        images.push(...loaded)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (!images.length) {
      throw new Error(errors[0] || '未能加载 PNG')
    }
    const seen = new Set<string>()
    const unique = images.filter((img) => {
      if (seen.has(img.path)) return false
      seen.add(img.path)
      return true
    })
    store.prependResults(unique)
    toast.ok(unique.length === 1 ? '已加载 PNG' : `已加载 ${unique.length} 张 PNG`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onNumberWheel(
  e: WheelEvent,
  key: 'width' | 'height' | 'batchSize' | 'steps' | 'clipSkip',
  step: number,
  min: number,
  max: number,
): void {
  const dir = e.deltaY < 0 ? 1 : -1
  const current = Number(store.form[key] || min)
  const next = Math.min(max, Math.max(min, current + dir * step))
  store.form[key] = next
}

function onResultListWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  if (!el || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY || e.deltaX
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:txt2img-split-v2" :default-width="624" :min-width="360" :max-width="960">
      <template #left>
      <section class="list-panel">
        <div class="panel-header">
          <div class="panel-title">参数</div>
          <div class="form-actions" style="padding-top: 0">
            <button
              ref="historyBtnRef"
              type="button"
              class="btn btn-ghost btn-icon"
              title="历史参数"
              aria-label="历史参数"
              aria-haspopup="listbox"
              :aria-expanded="historyOpen"
              @click="toggleHistory"
            >
              <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                <path
                  d="M512 64c247.424 0 448 200.576 448 448S759.424 960 512 960 64 759.424 64 512 264.576 64 512 64z m0 64c-212.077 0-384 171.923-384 384s171.923 384 384 384 384-171.923 384-384-171.923-384-384-384z m-32 160c35.346 0 64 28.654 64 64v128h128c34.993 0 63.426 28.084 63.991 62.942L736 544H512c-17.673 0-32-14.327-32-32V288z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="从剪贴板应用参数"
              aria-label="从剪贴板应用参数"
              @click="onApplyClipboard"
            >
              <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                <path
                  d="M480 112c0 35.346-28.654 64-64 64H176v672h672V578c0-34.993 28.084-63.426 62.942-63.991L912 514v366c0 17.673-14.327 32-32 32H144c-17.673 0-32-14.327-32-32V144c0-17.673 14.327-32 32-32h336z m-22.627 460.118c-17.674 0-32-14.327-32-32v-240c35.346 0 64 28.654 64 64v98.746L821.49 130.745c24.744-24.743 64.708-24.99 89.756-0.742l0.754 0.742-377.371 377.373h98.744c34.992 0 63.426 28.083 63.991 62.941l0.009 1.059h-240z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="格式化当前提示词"
              aria-label="格式化当前提示词"
              @click="onFormatParams"
            >
              <span class="btn-icon-braces" aria-hidden="true">{}</span>
            </button>
            <button
              ref="randomBtnRef"
              type="button"
              class="btn btn-ghost btn-icon"
              title="提示词池（追加到当前输入框）"
              aria-label="提示词池"
              aria-haspopup="menu"
              :aria-expanded="randomOpen"
              @click="toggleRandomMenu"
            >
              <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                <path
                  d="M864 64H704V32c0-17.066667-14.933333-32-32-32S640 14.933333 640 32V64H384V32c0-17.066667-14.933333-32-32-32S320 14.933333 320 32V64H160C142.933333 64 128 78.933333 128 96v896c0 17.066667 14.933333 32 32 32h704c17.066667 0 32-14.933333 32-32v-896c0-17.066667-14.933333-32-32-32zM832 960H192V128h128v64c0 17.066667 14.933333 32 32 32S384 209.066667 384 192V128h256v64c0 17.066667 14.933333 32 32 32S704 209.066667 704 192V128h128v832z"
                />
                <path
                  d="M704 384H320c-17.066667 0-32 14.933333-32 32S302.933333 448 320 448h384c17.066667 0 32-14.933333 32-32S721.066667 384 704 384zM704 640H320c-17.066667 0-32 14.933333-32 32S302.933333 704 320 704h384c17.066667 0 32-14.933333 32-32S721.066667 640 704 640z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-icon"
              :class="store.status === 'running' ? 'btn-danger btn-icon--running' : 'btn-primary'"
              :title="store.status === 'running' ? '生成中，点击停止' : '生成'"
              :aria-label="store.status === 'running' ? '生成中，点击停止' : '生成'"
              @click="store.status === 'running' ? onCancel() : onGenerate()"
            >
              <svg
                v-if="store.status === 'running'"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <Teleport to="body">
          <input
            v-if="historyOpen"
            ref="historyFilterRef"
            class="random-pick-filter-trap"
            type="text"
            tabindex="-1"
            autocomplete="off"
            aria-label="过滤参数历史"
            @input="onHistoryFilterInput"
            @blur="onHistoryFilterBlur"
          />
          <div
            v-if="historyOpen"
            class="param-history-menu"
            role="listbox"
            :style="historyMenuStyle"
          >
            <button
              v-for="item in filteredHistory"
              :key="item.fingerprint + item.at"
              type="button"
              class="param-history-item"
              role="option"
              @click="onRestoreHistory(item.fingerprint)"
            >
              <span class="param-history-summary" :title="item.form.prompt">
                <template v-for="(part, i) in fuzzyParts(promptSummary(item.form.prompt), historyQuery)" :key="i">
                  <mark v-if="part.hit" class="random-pick-hl">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <span class="param-history-time">{{ formatHms(item.at) }}</span>
            </button>
            <div v-if="!store.paramHistory.length" class="param-history-empty">暂无历史参数</div>
            <div v-else-if="!filteredHistory.length" class="param-history-empty">无匹配</div>
          </div>
        </Teleport>
        <Teleport to="body">
          <input
            v-if="randomOpen"
            ref="menuFilterRef"
            class="random-pick-filter-trap"
            type="text"
            tabindex="-1"
            autocomplete="off"
            aria-label="过滤提示词池"
            @input="onMenuFilterInput"
            @blur="onMenuFilterBlur"
          />
          <div
            v-if="randomOpen"
            class="random-pick-menu"
            role="menu"
            :style="randomMenuStyle"
          >
            <div
              v-for="item in filteredPools"
              :key="item.name"
              class="random-pick-row"
              @mouseenter="onPoolRowEnter(item, $event)"
              @mouseleave="onPoolRowLeave"
            >
              <button
                type="button"
                class="random-pick-item"
                role="menuitem"
                :title="'插入 &lt;pool:' + item.name + '&gt;'"
                :aria-haspopup="poolMenuEntries(item).length ? 'menu' : undefined"
                :aria-expanded="submenuPool === item.name || undefined"
                @click="onInsertPoolToken(item.name)"
              >
                <span class="random-pick-name">
                  <template v-for="(part, i) in fuzzyParts(item.name, menuQuery)" :key="i">
                    <mark v-if="part.hit" class="random-pick-hl">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <svg
                  v-if="filterPoolEntries(item, poolMenuEntries(item), menuQuery).length"
                  class="random-pick-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3.5L10.5 8 6 12.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="random-pick-dice"
                title="随机抽样一条"
                aria-label="随机抽样一条"
                @click.stop="onSamplePromptPool(item.name)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect
                    x="2.5"
                    y="2.5"
                    width="11"
                    height="11"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                  <circle cx="5.5" cy="5.5" r="0.85" fill="currentColor" />
                  <circle cx="8" cy="8" r="0.85" fill="currentColor" />
                  <circle cx="10.5" cy="10.5" r="0.85" fill="currentColor" />
                  <circle cx="10.5" cy="5.5" r="0.85" fill="currentColor" />
                  <circle cx="5.5" cy="10.5" r="0.85" fill="currentColor" />
                </svg>
              </button>
            </div>
            <div v-if="!filteredPools.length" class="random-pick-empty">无匹配</div>
          </div>
          <div
            v-if="randomOpen && submenuPool && filteredSubmenuEntries.length"
            class="random-pick-submenu"
            role="menu"
            :style="submenuStyle"
            @mouseenter="clearSubmenuCloseTimer"
            @mouseleave="onPoolRowLeave"
          >
            <button
              v-for="(entry, index) in filteredSubmenuEntries"
              :key="submenuPool + ':' + index"
              type="button"
              class="random-pick-item random-pick-subitem"
              role="menuitem"
              :class="{ 'is-off': entry.weight <= 0 }"
              :title="entry.prompt"
              @click="onPickPromptEntry(entry.prompt)"
            >
              <span class="random-pick-name">
                <template v-for="(part, i) in fuzzyParts(entry.prompt, menuQuery)" :key="i">
                  <mark v-if="part.hit" class="random-pick-hl">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
            </button>
          </div>
        </Teleport>
        <div class="panel-body">
          <div class="field">
            <div class="field-label-row">
              <label class="field-label" for="txt2img-prompt">Prompt</label>
              <span class="field-help" tabindex="0" aria-label="特殊语法说明">
                <svg class="field-help-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
                  <path d="M8 7v4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
                </svg>
                <div class="field-help-pop" role="tooltip">
                  <div class="field-help-title">特殊语法</div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称&gt;</code>
                    <span>从提示词池抽样</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:0.8,0.9&gt;</code>
                    <span>附带强度池</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:0.8,0.9:2,3&gt;</code>
                    <span>强度池 + 数量池</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:1,2,3&gt;</code>
                    <span>纯整数为数量池</span>
                  </div>
                  <div class="field-help-sep"></div>
                  <div class="field-help-block">
                    <code>&lt;random:文本&gt;</code>
                    <span>字面量，不查池</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:文本:0.8,0.9&gt;</code>
                    <span>字面量 + 强度</span>
                  </div>
                  <div class="field-help-sep"></div>
                  <div class="field-help-block">
                    <code>&lt;lora:名称&gt;</code>
                    <span>加载 LoRA（强度 1）</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;lora:名称:0.8&gt;</code>
                    <span>model/clip 同强度</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;lora:名称:0.8:0.6&gt;</code>
                    <span>model / clip 分离强度</span>
                  </div>
                </div>
              </span>
            </div>
            <PromptTextarea
              id="txt2img-prompt"
              ref="promptFieldRef"
              v-model="store.form.prompt"
              :family="store.form.family"
              :rows="5"
              field-attr="prompt"
              placeholder="可用 <pool:chara> / <pool:artist:0.8,0.9:3> / <random:my_tag:0.8,0.9>"
              @focus="onPromptFocus('prompt', $event)"
              @blur="onPromptBlur('prompt', $event)"
              @caret="onPromptSelect('prompt')"
            />
          </div>
          <div class="field">
            <label class="field-label">Negative Prompt</label>
            <PromptTextarea
              id="txt2img-negative"
              ref="negFieldRef"
              v-model="store.form.negativePrompt"
              :family="store.form.family"
              :rows="2"
              sm
              field-attr="negativePrompt"
              placeholder="同样可用 <pool:chara:1,2,3> 或 <random:tag:0.9>"
              @focus="onPromptFocus('negativePrompt', $event)"
              @blur="onPromptBlur('negativePrompt', $event)"
              @caret="onPromptSelect('negativePrompt')"
            />
          </div>

          <div class="field-row field-row--3">
            <div class="field">
              <label class="field-label">Width</label>
              <input
                v-model.number="store.form.width"
                class="input"
                type="number"
                min="64"
                step="64"
                @wheel.prevent="onNumberWheel($event, 'width', 64, 64, 2048)"
              />
            </div>
            <div class="field">
              <label class="field-label">Height</label>
              <input
                v-model.number="store.form.height"
                class="input"
                type="number"
                min="64"
                step="64"
                @wheel.prevent="onNumberWheel($event, 'height', 64, 64, 2048)"
              />
            </div>
            <div class="field">
              <label class="field-label">Batch</label>
              <input
                v-model.number="store.form.batchSize"
                class="input"
                type="number"
                min="1"
                max="64"
                @wheel.prevent="onNumberWheel($event, 'batchSize', 1, 1, 64)"
              />
            </div>
          </div>

          <div class="field-row field-row--5">
            <div class="field">
              <label class="field-label">Steps</label>
              <input
                v-model.number="store.form.steps"
                class="input"
                type="number"
                min="1"
                max="150"
                @wheel.prevent="onNumberWheel($event, 'steps', 1, 1, 150)"
              />
            </div>
            <div class="field">
              <label class="field-label">CFG</label>
              <input v-model.number="store.form.cfg" class="input" type="number" min="0" step="0.1" />
            </div>
            <div class="field">
              <label class="field-label">Clip skip</label>
              <input
                v-model.number="store.form.clipSkip"
                class="input"
                type="number"
                min="1"
                max="12"
                step="1"
                @wheel.prevent="onNumberWheel($event, 'clipSkip', 1, 1, 12)"
              />
            </div>
            <div class="field">
              <label class="field-label">Denoise</label>
              <input v-model.number="store.form.denoise" class="input" type="number" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label class="field-label">Seed</label>
              <input v-model="store.form.seed" class="input" type="text" placeholder="随机" />
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label">Sampler</label>
              <AppSelect v-model="store.form.sampler" :options="SAMPLER_OPTIONS" />
            </div>
            <div class="field">
              <label class="field-label">Scheduler</label>
              <AppSelect v-model="store.form.scheduler" :options="SCHEDULER_OPTIONS" />
            </div>
          </div>

          <div class="model-block">
            <div class="model-block-header">
              <div class="field-label">模型</div>
              <div class="family-switch" role="group" aria-label="模型模式">
                <button
                  type="button"
                  class="family-switch-btn"
                  :class="{ active: store.form.family === 'anima' }"
                  @click="onFamilyChange('anima')"
                >
                  Anima
                </button>
                <button
                  type="button"
                  class="family-switch-btn"
                  :class="{ active: store.form.family === 'sdxl' }"
                  @click="onFamilyChange('sdxl')"
                >
                  SDXL
                </button>
              </div>
            </div>

            <template v-if="store.form.family === 'anima'">
              <div class="field-row field-row--3">
                <div class="field">
                  <label class="field-label">UNET</label>
                  <ModelSelect v-model="store.form.unetModel" folder="unet" placeholder="选择 UNET" />
                </div>
                <div class="field">
                  <label class="field-label">CLIP</label>
                  <ModelSelect v-model="store.form.clipModel" folder="clip" placeholder="选择 CLIP" />
                </div>
                <div class="field">
                  <label class="field-label">VAE</label>
                  <ModelSelect v-model="store.form.vaeModel" folder="vae" placeholder="选择 VAE" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">CLIP Type</label>
                  <AppSelect v-model="store.form.clipType" :options="CLIP_TYPE_OPTIONS" />
                </div>
                <div class="field">
                  <label class="field-label">Weight Dtype</label>
                  <AppSelect v-model="store.form.unetWeightDtype" :options="WEIGHT_DTYPE_OPTIONS" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">AuraFlow Shift</label>
                  <input
                    v-model.number="store.form.auraflowShift"
                    class="input"
                    type="number"
                    step="0.1"
                  />
                </div>
                <div class="field">
                  <label class="field-label">Output Prefix</label>
                  <input v-model="store.form.outputPrefix" class="input" type="text" />
                </div>
              </div>
            </template>
            <template v-else>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">Checkpoint</label>
                  <ModelSelect
                    v-model="store.form.checkpoint"
                    folder="checkpoint"
                    placeholder="选择 Checkpoint"
                  />
                </div>
                <div class="field">
                  <label class="field-label">Output Prefix</label>
                  <input v-model="store.form.outputPrefix" class="input" type="text" />
                </div>
              </div>
            </template>
          </div>

        </div>
      </section>
      </template>

      <template #right>
      <section
        class="detail-panel"
        :class="{ 'is-drop-target': previewDragOver }"
        @dragenter="onPreviewDragEnter"
        @dragover="onPreviewDragOver"
        @dragleave="onPreviewDragLeave"
        @drop="onPreviewDrop"
      >
        <div class="panel-header">
          <div class="panel-title">预览</div>
          <div class="form-actions" style="padding-top: 0">
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="打开文件夹"
              aria-label="打开文件夹"
              @click="onOpenPreviewFolder"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4.5h4l1.2 1.5H13.5v6.5H2.5V4.5z"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="清空预览"
              aria-label="清空预览"
              @click="store.clearResults()"
            >
              <IconShredder />
            </button>
          </div>
        </div>
        <div class="panel-body">
          <div class="preview-area">
            <div class="preview-main">
              <img
                v-if="store.selectedImage"
                :src="store.selectedImage.dataUrl"
                :alt="store.selectedImage.filename"
                :data-image-path="store.selectedImage.path"
                draggable="false"
                @dragstart.prevent
              />
              <div v-else class="empty-state">
                <div class="title">尚未生成</div>
                <div class="hint">填写提示词后点击「生成」</div>
              </div>

              <div v-if="store.selectedImage" class="preview-float-actions">
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title="应用图片到参数"
                  aria-label="应用图片到参数"
                  @click="onApplyImageMeta"
                >
                  <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                    <path
                      d="M744 112c17.673 0 32 14.327 32 32v240.873c-35.346 0-64-28.653-64-64L711.999 176h-536v672h229.582c34.993 0 63.426 28.084 63.991 62.942l0.01 1.058H144c-17.673 0-32-14.327-32-32V144c0-17.673 14.327-32 32-32h600z m23.243 419.26l135.764 135.764c12.497 12.497 12.497 32.758 0 45.255L767.243 848.043c-24.994-24.993-24.994-65.516 0-90.51L802.773 722H310c-35.346 0-64-28.654-64-64h557.474l-36.231-36.23c-24.744-24.744-24.991-64.708-0.743-89.756l0.743-0.754zM408 424c30.619 0 55.498 24.573 55.992 55.074L464 480H302c-30.928 0-56-25.072-56-56h162z m178-156c30.619 0 55.498 24.573 55.992 55.074L642 324H302c-30.928 0-56-25.072-56-56h340z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title="查看图片信息"
                  aria-label="查看图片信息"
                  :class="{ 'is-active': infoOpen }"
                  @click="onToggleImageInfo"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
                    <path
                      d="M8 7.25V11M8 5.15v.2"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div v-if="infoOpen && infoSummary" class="preview-info-panel">
                <div class="preview-info-header">
                  <span>图片信息</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title="关闭"
                    aria-label="关闭"
                    @click="infoOpen = false"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M4.5 4.5l7 7M11.5 4.5l-7 7"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div class="preview-info-body">
                  <div class="preview-info-summary">
                    <div class="preview-info-block">
                      <div class="preview-info-label">Prompt</div>
                      <div class="preview-info-prompt">{{ infoSummary.prompt }}</div>
                    </div>
                    <div class="preview-info-block">
                      <div class="preview-info-label">Negative</div>
                      <div class="preview-info-prompt is-muted">{{ infoSummary.negativePrompt }}</div>
                    </div>
                    <div class="preview-info-chips">
                      <span class="preview-info-chip">{{ infoSummary.source }}</span>
                      <span v-if="infoSummary.family !== '—'" class="preview-info-chip">{{
                        infoSummary.family
                      }}</span>
                      <span class="preview-info-chip">{{ infoSummary.size }}</span>
                      <span class="preview-info-chip">{{ infoSummary.steps }} steps</span>
                      <span class="preview-info-chip">CFG {{ infoSummary.cfg }}</span>
                      <span class="preview-info-chip">{{ infoSummary.sampler }}</span>
                      <span class="preview-info-chip">{{ infoSummary.scheduler }}</span>
                      <span class="preview-info-chip">seed {{ infoSummary.seed }}</span>
                    </div>
                    <div class="preview-info-meta">
                      <div class="preview-info-row">
                        <span class="preview-info-label">Model</span>
                        <span class="preview-info-value" :title="infoSummary.model">{{
                          infoSummary.model
                        }}</span>
                      </div>
                      <div class="preview-info-row">
                        <span class="preview-info-label">File</span>
                        <span class="preview-info-value" :title="infoSummary.path">{{
                          infoSummary.filename
                        }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="preview-info-block">
                    <div class="preview-info-label">原始详情</div>
                    <pre class="preview-info-raw">{{ infoRaw }}</pre>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="store.results.length"
              class="result-list"
              @wheel.prevent="onResultListWheel"
            >
              <button
                v-for="(img, i) in store.results"
                :key="img.path + i"
                type="button"
                class="result-thumb"
                :class="{ active: i === store.selectedIndex }"
                draggable="false"
                @click="store.selectImage(i)"
                @dragstart.prevent
              >
                <img
                  :src="img.dataUrl"
                  :alt="img.filename"
                  :data-image-path="img.path"
                  draggable="false"
                />
              </button>
            </div>
          </div>
        </div>
      </section>
      </template>
    </SplitPane>
  </div>
</template>
