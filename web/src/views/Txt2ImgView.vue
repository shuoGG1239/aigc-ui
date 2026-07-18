<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import ModelSelect from '@/components/common/ModelSelect.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import type { ModelFamily } from '@/models/family'
import { nextPoolPrompt } from '@/random/prompt-pool-engine'
import { usePromptPoolStore } from '@/stores/promptPool'
import { useTxt2ImgStore } from '@/stores/txt2img'
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
const randomOpen = ref(false)
const randomBtnRef = ref<HTMLButtonElement | null>(null)
const randomMenuStyle = ref<Record<string, string>>({})
/** Last focused prompt field; dice inserts at saved caret. */
const focusedPromptField = ref<'prompt' | 'negativePrompt'>('prompt')
const promptTaRef = ref<HTMLTextAreaElement | null>(null)
const negTaRef = ref<HTMLTextAreaElement | null>(null)
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
  return field === 'prompt' ? promptTaRef.value : negTaRef.value
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

function onPromptSelect(field: 'prompt' | 'negativePrompt', e: Event): void {
  savePromptCaret(field, e.target as HTMLTextAreaElement)
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
  store.form[field] = result.prompt
  toast.ok(result.kind === 'anima' ? '已按 Anima 规范格式化' : '已按 SDXL 规范格式化')
}

function onFormatParams(): void {
  onFormatField(focusedPromptField.value)
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
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) {
    await nextTick()
    updateHistoryMenuPosition()
  }
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
    await nextTick()
    updateRandomMenuPosition()
  }
}

function onPickPromptPool(name: string): void {
  const pool = poolStore.getByName(name)
  if (!pool) return
  const sampled = nextPoolPrompt(pool, store.form.family).trim()
  if (!sampled) {
    toast.error('该提示词池未产出内容（检查条目/权重）')
    return
  }
  appendToFocusedPrompt(sampled)
  randomOpen.value = false
  const target = focusedPromptField.value === 'negativePrompt' ? 'Negative' : 'Prompt'
  toast.ok(`已追加到 ${target}`)
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
    store.applyForm(next)
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
  randomOpen.value = false
}

function onPopupKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    historyOpen.value = false
    randomOpen.value = false
  }
}

watch(historyOpen, (open) => {
  if (open) {
    window.addEventListener('resize', updateHistoryMenuPosition)
    window.addEventListener('scroll', updateHistoryMenuPosition, true)
    document.addEventListener('mousedown', onHistoryDocClick)
    document.addEventListener('keydown', onPopupKey)
  } else {
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
    window.removeEventListener('resize', updateRandomMenuPosition)
    window.removeEventListener('scroll', updateRandomMenuPosition, true)
    document.removeEventListener('mousedown', onRandomDocClick)
    if (!historyOpen.value) document.removeEventListener('keydown', onPopupKey)
  }
})

onBeforeUnmount(() => {
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
    store.applyForm(
      parseWorkflowParams(JSON.stringify(info), {
        preferFamily: store.form.family,
        base: store.form,
      }),
    )
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

  const file = e.dataTransfer?.files?.[0]
  if (!file) {
    toast.error('请拖入 PNG 图片或文件夹')
    return
  }

  try {
    const targetPath = window.api.getPathForFile(file)
    if (!targetPath) {
      throw new Error('无法读取拖入路径')
    }
    const images = await window.api.image.loadPreviewFromPath(targetPath, 5)
    store.prependResults(images)
    toast.ok(images.length === 1 ? '已加载 PNG' : `已加载 ${images.length} 张 PNG`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onNumberWheel(
  e: WheelEvent,
  key: 'width' | 'height' | 'batchSize' | 'steps',
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8.5" r="5.25" stroke="currentColor" stroke-width="1.5" />
                <path
                  d="M8 5.75V8.5l2 1.25"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path
                  d="M14.5 8H10.5C10.224 8 10 8.224 10 8.5C10 9.603 9.103 10.5 8 10.5C6.897 10.5 6 9.603 6 8.5C6 8.224 5.776 8 5.5 8H1.5C1.224 8 1 8.224 1 8.5V12.5C1 13.878 2.121 15 3.5 15H12.5C13.879 15 15 13.878 15 12.5V8.5C15 8.224 14.776 8 14.5 8ZM14 12.5C14 13.327 13.327 14 12.5 14H3.5C2.673 14 2 13.327 2 12.5V9H5.042C5.28 10.417 6.517 11.5 8 11.5C9.483 11.5 10.72 10.417 10.958 9H14V12.5ZM5.646 1.146C5.451 1.341 5.451 1.658 5.646 1.853L7.646 3.853C7.841 4.048 8.158 4.048 8.353 3.853L10.353 1.853C10.548 1.658 10.548 1.341 10.353 1.146C10.255 1.048 10.127 1 9.999 1C9.871 1 9.743 1.049 9.645 1.146L8.499 2.292V1.499C8.499 1.223 8.275 0.999 7.999 0.999C7.723 0.999 7.499 1.223 7.499 1.499V2.292L6.353 1.146C6.158 0.951 5.841 0.951 5.646 1.146ZM8.5 5.5C8.5 5.776 8.276 6 8 6C7.724 6 7.5 5.776 7.5 5.5C7.5 5.224 7.724 5 8 5C8.276 5 8.5 5.224 8.5 5.5ZM8.5 7.5C8.5 7.776 8.276 8 8 8C7.724 8 7.5 7.776 7.5 7.5C7.5 7.224 7.724 7 8 7C8.276 7 8.5 7.224 8.5 7.5Z"
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
              title="随机提示词池（追加到当前输入框）"
              aria-label="随机提示词池"
              aria-haspopup="menu"
              :aria-expanded="randomOpen"
              @click="toggleRandomMenu"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect
                  x="2.5"
                  y="2.5"
                  width="11"
                  height="11"
                  rx="2"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" />
                <circle cx="8" cy="8" r="0.9" fill="currentColor" />
                <circle cx="10.5" cy="10.5" r="0.9" fill="currentColor" />
                <circle cx="10.5" cy="5.5" r="0.9" fill="currentColor" />
                <circle cx="5.5" cy="10.5" r="0.9" fill="currentColor" />
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
          <div
            v-if="historyOpen"
            class="param-history-menu"
            role="listbox"
            :style="historyMenuStyle"
          >
            <button
              v-for="item in store.paramHistory"
              :key="item.fingerprint + item.at"
              type="button"
              class="param-history-item"
              role="option"
              @click="onRestoreHistory(item.fingerprint)"
            >
              <span class="param-history-summary" :title="item.form.prompt">
                {{ promptSummary(item.form.prompt) }}
              </span>
              <span class="param-history-time">{{ formatHms(item.at) }}</span>
            </button>
            <div v-if="!store.paramHistory.length" class="param-history-empty">暂无历史参数</div>
          </div>
        </Teleport>
        <Teleport to="body">
          <div v-if="randomOpen" class="random-pick-menu" role="menu" :style="randomMenuStyle">
            <button
              v-for="item in poolStore.pools"
              :key="item.name"
              type="button"
              class="random-pick-item"
              role="menuitem"
              @click="onPickPromptPool(item.name)"
            >
              <span class="random-pick-name">{{ item.name }}</span>
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
                </div>
              </span>
            </div>
            <textarea
              id="txt2img-prompt"
              ref="promptTaRef"
              v-model="store.form.prompt"
              class="textarea"
              rows="5"
              data-prompt-field="prompt"
              placeholder="可用 <pool:chara> / <pool:artist:0.8,0.9:3> / <random:my_tag:0.8,0.9>"
              @focus="onPromptFocus('prompt', $event)"
              @blur="onPromptBlur('prompt', $event)"
              @select="onPromptSelect('prompt', $event)"
              @keyup="onPromptSelect('prompt', $event)"
              @click="onPromptSelect('prompt', $event)"
            />
          </div>
          <div class="field">
            <label class="field-label">Negative Prompt</label>
            <textarea
              ref="negTaRef"
              v-model="store.form.negativePrompt"
              class="textarea textarea--sm"
              rows="2"
              data-prompt-field="negativePrompt"
              placeholder="同样可用 <pool:chara:1,2,3> 或 <random:tag:0.9>"
              @focus="onPromptFocus('negativePrompt', $event)"
              @blur="onPromptBlur('negativePrompt', $event)"
              @select="onPromptSelect('negativePrompt', $event)"
              @keyup="onPromptSelect('negativePrompt', $event)"
              @click="onPromptSelect('negativePrompt', $event)"
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

          <div class="field-row field-row--4">
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
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path
                      d="M14.5 8H10.5C10.224 8 10 8.224 10 8.5C10 9.603 9.103 10.5 8 10.5C6.897 10.5 6 9.603 6 8.5C6 8.224 5.776 8 5.5 8H1.5C1.224 8 1 8.224 1 8.5V12.5C1 13.878 2.121 15 3.5 15H12.5C13.879 15 15 13.878 15 12.5V8.5C15 8.224 14.776 8 14.5 8ZM14 12.5C14 13.327 13.327 14 12.5 14H3.5C2.673 14 2 13.327 2 12.5V9H5.042C5.28 10.417 6.517 11.5 8 11.5C9.483 11.5 10.72 10.417 10.958 9H14V12.5ZM5.646 3.854C5.451 3.659 5.451 3.342 5.646 3.147L7.646 1.147C7.841 0.952 8.158 0.952 8.353 1.147L10.353 3.147C10.548 3.342 10.548 3.659 10.353 3.854C10.255 3.952 10.127 4 9.999 4C9.871 4 9.743 3.951 9.645 3.854L8.499 2.708V3.501C8.499 3.777 8.275 4.001 7.999 4.001C7.723 4.001 7.499 3.777 7.499 3.501V2.708L6.353 3.854C6.158 4.049 5.841 4.049 5.646 3.854ZM8.5 5.5C8.5 5.776 8.276 6 8 6C7.724 6 7.5 5.776 7.5 5.5C7.5 5.224 7.724 5 8 5C8.276 5 8.5 5.224 8.5 5.5ZM8.5 7.5C8.5 7.776 8.276 8 8 8C7.724 8 7.5 7.776 7.5 7.5C7.5 7.224 7.724 7 8 7C8.276 7 8.5 7.224 8.5 7.5Z"
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
