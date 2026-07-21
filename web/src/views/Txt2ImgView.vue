<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import ModelSelect from '@/components/common/ModelSelect.vue'
import PromptTextarea from '@/components/common/PromptTextarea.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import ParamHistoryMenu from '@/components/txt2img/ParamHistoryMenu.vue'
import PromptPoolPickMenu from '@/components/txt2img/PromptPoolPickMenu.vue'
import Txt2ImgPreviewPanel from '@/components/txt2img/Txt2ImgPreviewPanel.vue'
import { useToast } from '@/composables/useToast'
import type { ModelFamily } from '@shared/family'
import {
  BATCH_SIZE_MAX,
  BATCH_SIZE_MIN,
  CLIP_SKIP_MAX,
  CLIP_SKIP_MIN,
  LATENT_SIZE_MAX,
  LATENT_SIZE_MIN,
  LATENT_SIZE_STEP,
} from '@shared/limits'
import { usePromptPoolStore } from '@/stores/prompt-pool'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { replaceEditableValue } from '@/utils/editable-text'
import { formatPromptByFamily } from '@/prompt/prompt-format'
import { expandPromptTemplate } from '@/prompt/prompt-template'
import { parseWorkflowParams } from '@/utils/workflow-params'
import {
  CLIP_TYPE_OPTIONS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
  WEIGHT_DTYPE_OPTIONS,
} from '@/utils/select-options'

defineOptions({ name: 'Txt2ImgView' })

const store = useTxt2ImgStore()
const poolStore = usePromptPoolStore()
const toast = useToast()
const historyMenuRef = ref<InstanceType<typeof ParamHistoryMenu> | null>(null)
const poolPickMenuRef = ref<InstanceType<typeof PromptPoolPickMenu> | null>(null)
/** Last focused prompt field; pool pick inserts at saved caret. */
const focusedPromptField = ref<'prompt' | 'negativePrompt'>('prompt')
const promptFieldRef = ref<InstanceType<typeof PromptTextarea> | null>(null)
const negFieldRef = ref<InstanceType<typeof PromptTextarea> | null>(null)
/** null = insert at end of field. */
const promptCaret = ref<{ start: number; end: number } | null>(null)
/** Try `<pool:>` / `<random:>` from the Prompt field-help popover. */
const syntaxTryInput = ref('')
const fieldHelpRef = ref<HTMLElement | null>(null)
const fieldHelpPopRef = ref<HTMLElement | null>(null)
const fieldHelpOpen = ref(false)
const fieldHelpPopStyle = ref<Record<string, string>>({})
let fieldHelpCloseTimer: number | undefined
/** Click / right-click pins the pop; mouseleave won't close until outside click. */
let fieldHelpPinned = false

function isInsideFieldHelp(target: EventTarget | null): boolean {
  const el =
    target instanceof Element ? target : ((target as Node | null)?.parentElement ?? null)
  if (!el) return false
  if (el.closest('.field-help-pop--portal, .field-help')) return true
  return !!(fieldHelpRef.value?.contains(el) || fieldHelpPopRef.value?.contains(el))
}

function updateFieldHelpPosition(): void {
  const el = fieldHelpRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxWidth = Math.min(420, window.innerWidth * 0.8)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - maxWidth - 8))
  const gap = 6
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8
  const spaceAbove = rect.top - gap - 8
  const openUp = spaceBelow < 280 && spaceAbove > spaceBelow
  const maxHeight = Math.max(160, openUp ? spaceAbove : spaceBelow)

  fieldHelpPopStyle.value = {
    left: `${left}px`,
    maxWidth: `${maxWidth}px`,
    maxHeight: `${maxHeight}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + gap}px`, top: 'auto' }
      : { top: `${rect.bottom + gap}px`, bottom: 'auto' }),
  }
}

function openFieldHelp(): void {
  if (fieldHelpCloseTimer != null) {
    window.clearTimeout(fieldHelpCloseTimer)
    fieldHelpCloseTimer = undefined
  }
  fieldHelpOpen.value = true
  void nextTick(() => updateFieldHelpPosition())
}

function closeFieldHelp(): void {
  fieldHelpPinned = false
  if (fieldHelpCloseTimer != null) {
    window.clearTimeout(fieldHelpCloseTimer)
    fieldHelpCloseTimer = undefined
  }
  fieldHelpOpen.value = false
}

function scheduleCloseFieldHelp(): void {
  if (fieldHelpPinned) return
  if (fieldHelpCloseTimer != null) window.clearTimeout(fieldHelpCloseTimer)
  fieldHelpCloseTimer = window.setTimeout(() => {
    fieldHelpCloseTimer = undefined
    if (fieldHelpPinned) return
    fieldHelpOpen.value = false
  }, 120)
}

function pinFieldHelp(): void {
  fieldHelpPinned = true
  openFieldHelp()
}

function onFieldHelpTriggerClick(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  if (fieldHelpPinned && fieldHelpOpen.value) {
    closeFieldHelp()
    return
  }
  pinFieldHelp()
}

function onFieldHelpContextMenu(): void {
  pinFieldHelp()
}

function onFieldHelpFocusOut(e: FocusEvent): void {
  if (fieldHelpPinned) return
  if (isInsideFieldHelp(e.relatedTarget)) return
  // relatedTarget is often null when focus moves into the teleported pop on click.
  window.setTimeout(() => {
    if (fieldHelpPinned || !fieldHelpOpen.value) return
    if (isInsideFieldHelp(document.activeElement)) return
    if (fieldHelpRef.value?.matches(':hover') || fieldHelpPopRef.value?.matches(':hover')) return
    scheduleCloseFieldHelp()
  }, 0)
}

function onFieldHelpDocMouseDown(e: MouseEvent): void {
  if (isInsideFieldHelp(e.target)) {
    openFieldHelp()
    return
  }
  closeFieldHelp()
}

function onFieldHelpKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  closeFieldHelp()
}

watch(fieldHelpOpen, (open) => {
  if (open) {
    window.addEventListener('resize', updateFieldHelpPosition)
    window.addEventListener('scroll', updateFieldHelpPosition, true)
    document.addEventListener('mousedown', onFieldHelpDocMouseDown, true)
    document.addEventListener('keydown', onFieldHelpKey)
  } else {
    fieldHelpPinned = false
    window.removeEventListener('resize', updateFieldHelpPosition)
    window.removeEventListener('scroll', updateFieldHelpPosition, true)
    document.removeEventListener('mousedown', onFieldHelpDocMouseDown, true)
    document.removeEventListener('keydown', onFieldHelpKey)
  }
})

function promptTextareaEl(field: 'prompt' | 'negativePrompt'): HTMLTextAreaElement | null {
  const comp = field === 'prompt' ? promptFieldRef.value : negFieldRef.value
  return comp?.getTextarea() ?? null
}

function savePromptCaret(field: 'prompt' | 'negativePrompt', el?: HTMLTextAreaElement | null): void {
  focusedPromptField.value = field
  const ta = el ?? promptTextareaEl(field)
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

  const ta = promptTextareaEl(field)
  const cur = ta?.value ?? store.form[field]
  let start = promptCaret.value?.start ?? cur.length
  let end = promptCaret.value?.end ?? cur.length
  start = Math.max(0, Math.min(start, cur.length))
  end = Math.max(start, Math.min(end, cur.length))

  const left = cur.slice(0, start)
  const needComma = left.trim().length > 0 && !/[,|｜]\s*$/.test(left)
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
    const el = promptTextareaEl(field)
    if (!el) return
    el.focus()
    el.setSelectionRange(newPos, newPos)
  })
}

/** Write prompt/negative via native undo stack when the textarea exists. */
function setPromptField(field: 'prompt' | 'negativePrompt', next: string): void {
  if (store.form[field] === next) return
  const ta = promptTextareaEl(field)
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

/** Expand special syntax once and show the sample in a toast. */
function onTrySyntax(): void {
  const template = syntaxTryInput.value.trim()
  if (!template) {
    toast.info('请输入要试运行的语法')
    return
  }
  try {
    const { prompt, missing } = expandPromptTemplate(
      template,
      store.form.family,
      (name) => poolStore.getByName(name),
      {
        checkpoint: store.form.checkpoint,
        unetModel: store.form.unetModel,
      },
    )
    if (missing.length) {
      toast.error(`未找到提示词池：${missing.join(', ')}`)
      return
    }
    const text = prompt.trim() || '(空)'
    const message = `抽样结果: ${text}`
    toast.ok(message, Math.min(10000, Math.max(4500, 3000 + message.length * 25)))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
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

function onHistoryMenuOpen(): void {
  poolPickMenuRef.value?.close()
}

function onPoolPickMenuOpen(): void {
  historyMenuRef.value?.close()
}

function onPoolPick(text: string): void {
  appendToFocusedPrompt(text)
  const target = focusedPromptField.value === 'negativePrompt' ? 'Negative' : 'Prompt'
  toast.ok(`已追加到 ${target}`)
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

let offFormat: (() => void) | undefined
onMounted(() => {
  offFormat = window.api.txt2img.onFormat((field) => onFormatField(field))
  void poolStore.hydrate()
})
onUnmounted(() => {
  offFormat?.()
  fieldHelpPinned = false
  if (fieldHelpCloseTimer != null) window.clearTimeout(fieldHelpCloseTimer)
  window.removeEventListener('resize', updateFieldHelpPosition)
  window.removeEventListener('scroll', updateFieldHelpPosition, true)
  document.removeEventListener('mousedown', onFieldHelpDocMouseDown, true)
  document.removeEventListener('keydown', onFieldHelpKey)
})

async function onGenerate(): Promise<void> {
  try {
    const count = await store.generate()
    toast.ok(count > 1 ? `生成完成 ${count} 张` : `生成完成 (seed=${store.lastSeed})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === '已取消生成') return
    toast.error(msg)
  }
}

async function onCancel(): Promise<void> {
  await store.cancel()
  toast.info('已请求取消')
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
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:txt2img-split-v3" :default-width="624" :min-width="360" :max-ratio="0.72">
      <template #left>
      <section class="list-panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <div class="panel-title">参数</div>
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
          <div class="form-actions" style="padding-top: 0">
            <ParamHistoryMenu ref="historyMenuRef" @open="onHistoryMenuOpen" />
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
            <PromptPoolPickMenu
              ref="poolPickMenuRef"
              @open="onPoolPickMenuOpen"
              @pick="onPoolPick"
            />
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
          <div
            v-if="store.status === 'running'"
            class="gen-progress-track"
            role="progressbar"
            :aria-valuenow="store.progressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="store.progressLabel || '生成进度'"
          >
            <div class="gen-progress-fill" :style="{ width: `${store.progressPercent}%` }" />
          </div>
        </div>

        <div class="panel-body txt2img-body">
          <div class="txt2img-prompts">
          <div class="field field--grow field--prompt">
            <div class="field-label-row">
              <label class="field-label" for="txt2img-prompt">Prompt</label>
              <span
                ref="fieldHelpRef"
                class="field-help"
                :class="{ 'is-open': fieldHelpOpen }"
                tabindex="0"
                aria-label="特殊语法说明"
                @click="onFieldHelpTriggerClick"
                @mouseenter="openFieldHelp"
                @mouseleave="scheduleCloseFieldHelp"
                @focusin="openFieldHelp"
                @focusout="onFieldHelpFocusOut"
                @contextmenu="onFieldHelpContextMenu"
              >
                <svg class="field-help-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
                  <path d="M8 7v4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
                </svg>
              </span>
              <Teleport to="body">
                <div
                  v-if="fieldHelpOpen"
                  ref="fieldHelpPopRef"
                  class="field-help-pop field-help-pop--portal"
                  role="tooltip"
                  :style="fieldHelpPopStyle"
                  @mouseenter="openFieldHelp"
                  @mouseleave="scheduleCloseFieldHelp"
                  @focusin="openFieldHelp"
                  @focusout="onFieldHelpFocusOut"
                  @contextmenu="onFieldHelpContextMenu"
                  @mousedown.stop
                >
                  <div class="field-help-try">
                    <input
                      class="input"
                      v-model="syntaxTryInput"
                      type="text"
                      spellcheck="false"
                      placeholder="语法测试 <random:a|b> / <pool:chara>"
                      aria-label="试运行特殊语法"
                      @keydown.enter.prevent="onTrySyntax"
                      @click.stop
                    />
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon field-help-try-btn"
                      title="试运行"
                      aria-label="试运行"
                      @click.stop="onTrySyntax"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                  <div class="field-help-sep"></div>
                  <div class="field-help-title">特殊语法</div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称&gt;</code>
                    <span>从提示词池抽样</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:0.8|0.9&gt;</code>
                    <span>浮点为强度池（| 或 ,）</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:2,3:0.8,0.9&gt;</code>
                    <span>整数=数量，浮点=强度（顺序无关）</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:名称:1,2,3&gt;</code>
                    <span>纯整数为数量池</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;pool:&lt;random:a|b&gt;&gt;</code>
                    <span>先随机池名再抽样</span>
                  </div>
                  <div class="field-help-sep"></div>
                  <div class="field-help-block">
                    <code>&lt;random:文本&gt;</code>
                    <span>字面量，不查池</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:a|b&gt;</code>
                    <span>等概率多选一</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:a|&gt;</code>
                    <span>50% 出 a，50% 空</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:a|b:2,3:0.8,0.9&gt;</code>
                    <span>多选一 + 数量/强度（顺序无关）</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:&lt;pool:a&gt;|&lt;pool:b&gt;&gt;</code>
                    <span>先选枝再展开内层</span>
                  </div>
                  <div class="field-help-block">
                    <code>&lt;random:`&lt;pool:a&gt;`|`&lt;pool:b&gt;`&gt;</code>
                    <span>反引号内不展开，原样输出</span>
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
              </Teleport>
            </div>
            <PromptTextarea
              id="txt2img-prompt"
              ref="promptFieldRef"
              v-model="store.form.prompt"
              :family="store.form.family"
              fill
              field-attr="prompt"
              placeholder="可用 <pool:chara> / <pool:artist:2,3:0.8,0.9> / <random:a|b:0.8,0.9>"
              @focus="onPromptFocus('prompt', $event)"
              @blur="onPromptBlur('prompt', $event)"
              @caret="onPromptSelect('prompt')"
            />
          </div>

          <div class="field field--grow field--negative">
            <label class="field-label" for="txt2img-negative">Negative Prompt</label>
            <PromptTextarea
              id="txt2img-negative"
              ref="negFieldRef"
              v-model="store.form.negativePrompt"
              :family="store.form.family"
              fill
              field-attr="negativePrompt"
              placeholder="同样可用 <pool:chara:1|2|3> 或 <random:tag:0.9>"
              @focus="onPromptFocus('negativePrompt', $event)"
              @blur="onPromptBlur('negativePrompt', $event)"
              @caret="onPromptSelect('negativePrompt')"
            />
          </div>
          </div>

          <div class="txt2img-rest">
          <div class="field-row field-row--3">
            <div class="field">
              <label class="field-label">Width</label>
              <input
                v-model.number="store.form.width"
                class="input"
                type="number"
                :min="LATENT_SIZE_MIN"
                :step="LATENT_SIZE_STEP"
                @wheel.prevent="
                  onNumberWheel($event, 'width', LATENT_SIZE_STEP, LATENT_SIZE_MIN, LATENT_SIZE_MAX)
                "
              />
            </div>
            <div class="field">
              <label class="field-label">Height</label>
              <input
                v-model.number="store.form.height"
                class="input"
                type="number"
                :min="LATENT_SIZE_MIN"
                :step="LATENT_SIZE_STEP"
                @wheel.prevent="
                  onNumberWheel($event, 'height', LATENT_SIZE_STEP, LATENT_SIZE_MIN, LATENT_SIZE_MAX)
                "
              />
            </div>
            <div class="field">
              <label class="field-label">Batch</label>
              <input
                v-model.number="store.form.batchSize"
                class="input"
                type="number"
                :min="BATCH_SIZE_MIN"
                :max="BATCH_SIZE_MAX"
                @wheel.prevent="
                  onNumberWheel($event, 'batchSize', 1, BATCH_SIZE_MIN, BATCH_SIZE_MAX)
                "
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
                :min="CLIP_SKIP_MIN"
                :max="CLIP_SKIP_MAX"
                step="1"
                @wheel.prevent="
                  onNumberWheel($event, 'clipSkip', 1, CLIP_SKIP_MIN, CLIP_SKIP_MAX)
                "
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

        </div>
      </section>
      </template>

      <template #right>
        <Txt2ImgPreviewPanel @apply-meta="onApplyImageMeta" />
      </template>
    </SplitPane>
  </div>
</template>
