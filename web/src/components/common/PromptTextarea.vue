<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { ModelFamily } from '@/models/family'
import {
  ensureLoraList,
  searchLoras,
  type LoraHit,
} from '@/prompt/tag-complete/lora-db'
import {
  ensureTagDb,
  formatCount,
  searchTags,
  tagCategoryClass,
  type TagHit,
} from '@/prompt/tag-complete/tag-db'
import {
  formatLoraInsert,
  formatTagInsert,
  getCaretToken,
  type CaretToken,
} from '@/prompt/tag-complete/token'
import { fuzzyParts } from '@/utils/fuzzy'

interface SuggestItem {
  kind: 'tag' | 'lora'
  key: string
  label: string
  meta: string
  category?: number
  insert: string
  matchedAlias?: string
}

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    family: ModelFamily
    id?: string
    rows?: number
    placeholder?: string
    sm?: boolean
    fieldAttr?: string
  }>(),
  {
    rows: 5,
    placeholder: '',
    sm: false,
  },
)

const emit = defineEmits<{
  focus: [e: FocusEvent]
  blur: [e: FocusEvent]
  caret: []
}>()

const taRef = ref<HTMLTextAreaElement | null>(null)
const open = ref(false)
const items = ref<SuggestItem[]>([])
const active = ref(0)
const token = ref<CaretToken | null>(null)
const panelStyle = ref<Record<string, string>>({})
let debounceTimer: number | null = null
let blurTimer: number | null = null
let dbReady = false

const hasItems = computed(() => open.value && items.value.length > 0)

function hide(): void {
  open.value = false
  items.value = []
  active.value = 0
  token.value = null
}

function positionPanel(): void {
  const ta = taRef.value
  if (!ta) return
  const rect = ta.getBoundingClientRect()
  const maxH = 240
  const gap = 4
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const placeAbove = spaceBelow < 120 && rect.top > spaceBelow
  const height = Math.min(maxH, Math.max(100, placeAbove ? rect.top - gap : spaceBelow))
  panelStyle.value = {
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`,
    maxHeight: `${height}px`,
    ...(placeAbove
      ? { bottom: `${Math.round(window.innerHeight - rect.top + gap)}px`, top: 'auto' }
      : { top: `${Math.round(rect.bottom + gap)}px`, bottom: 'auto' }),
  }
}

function clearBlurTimer(): void {
  if (blurTimer != null) {
    window.clearTimeout(blurTimer)
    blurTimer = null
  }
}

function ensureDb(): void {
  if (dbReady) return
  ensureTagDb()
  dbReady = true
}

async function refresh(): Promise<void> {
  const ta = taRef.value
  if (!ta || document.activeElement !== ta) {
    hide()
    return
  }

  const text = ta.value
  const caret = ta.selectionStart ?? 0
  const tok = getCaretToken(text, caret)
  token.value = tok
  if (!tok) {
    hide()
    return
  }
  if (tok.mode === 'tag' && tok.query.trim().length < 2) {
    hide()
    return
  }

  let next: SuggestItem[] = []
  if (tok.mode === 'lora') {
    try {
      const files = await ensureLoraList()
      if (document.activeElement !== ta) return
      next = searchLoras(files, tok.query).map((h: LoraHit) => ({
        kind: 'lora' as const,
        key: `lora:${h.fileName}`,
        label: h.stem,
        meta:
          h.fileName.includes('/') || h.fileName.includes('\\') ? h.fileName : 'LoRA',
        insert: formatLoraInsert(h.fileName),
      }))
    } catch (err) {
      console.warn('[tag-complete] LoRA 列表加载失败', err)
      next = []
    }
  } else {
    try {
      ensureDb()
    } catch (err) {
      console.error('[tag-complete] 标签词库加载失败', err)
      hide()
      return
    }
    next = searchTags(tok.query).map((h: TagHit) => ({
      kind: 'tag' as const,
      key: `tag:${h.name}`,
      label: formatTagInsert(h.name, props.family),
      meta: formatCount(h.count),
      category: h.category,
      matchedAlias: h.matchedAlias,
      insert: formatTagInsert(h.name, props.family),
    }))
  }

  if (document.activeElement !== ta) return

  items.value = next
  active.value = 0
  open.value = next.length > 0
  if (open.value) {
    await nextTick()
    positionPanel()
  }
}

function scheduleRefresh(): void {
  if (debounceTimer != null) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void refresh()
  }, 40)
}

function applyAt(index: number): void {
  const ta = taRef.value
  const tok = token.value
  const item = items.value[index]
  if (!ta || !tok || !item) return

  const text = ta.value
  const left = text.slice(0, tok.start)
  let right = text.slice(tok.end)
  let insert = item.insert
  if (item.kind === 'tag') {
    if (/^\s*,/.test(right)) {
      right = right.replace(/^\s*/, '')
    } else {
      insert = `${insert}, `
    }
  }

  const next = left + insert + right
  const caret = left.length + insert.length
  hide()

  ta.focus()
  ta.setSelectionRange(0, text.length)
  const ok = document.execCommand('insertText', false, next)
  if (ok) {
    model.value = ta.value
  } else {
    model.value = next
    void nextTick(() => {
      const el = taRef.value
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
    return
  }
  void nextTick(() => {
    const el = taRef.value
    if (!el) return
    el.setSelectionRange(caret, caret)
    emit('caret')
  })
}

function moveActive(delta: number): void {
  if (!items.value.length) return
  const n = items.value.length
  active.value = (active.value + delta + n) % n
  void nextTick(() => {
    const el = document.querySelector('.tac-panel .tac-item.is-active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(e: KeyboardEvent): void {
  if (!hasItems.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveActive(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveActive(-1)
    return
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    applyAt(active.value)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    hide()
  }
}

function onFocus(e: FocusEvent): void {
  clearBlurTimer()
  try {
    ensureDb()
  } catch (err) {
    console.error('[tag-complete] 预加载词库失败', err)
  }
  scheduleRefresh()
  emit('focus', e)
}

function onBlur(e: FocusEvent): void {
  clearBlurTimer()
  blurTimer = window.setTimeout(() => {
    blurTimer = null
    hide()
  }, 180)
  emit('blur', e)
}

function onInput(): void {
  scheduleRefresh()
  emit('caret')
}

function onCaret(): void {
  scheduleRefresh()
  emit('caret')
}

function highlight(label: string) {
  const q = token.value?.query ?? ''
  if (token.value?.mode === 'lora') return fuzzyParts(label, q)
  const qLabel = props.family === 'anima' ? q.replace(/_/g, ' ') : q
  return fuzzyParts(label, qLabel)
}

onBeforeUnmount(() => {
  if (debounceTimer != null) window.clearTimeout(debounceTimer)
  clearBlurTimer()
})

defineExpose({
  getTextarea: () => taRef.value,
})
</script>

<template>
  <div class="prompt-textarea">
    <textarea
      :id="id"
      ref="taRef"
      v-model="model"
      class="textarea"
      :class="{ 'textarea--sm': sm }"
      :rows="rows"
      :placeholder="placeholder"
      :data-prompt-field="fieldAttr"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKeydown"
      @click="onCaret"
      @keyup="onCaret"
      @select="onCaret"
    />
    <Teleport to="body">
      <div
        v-if="hasItems"
        class="tac-panel"
        :style="panelStyle"
        role="listbox"
        @mousedown.prevent
      >
        <button
          v-for="(item, i) in items"
          :key="item.key"
          type="button"
          class="tac-item"
          :class="[
            { 'is-active': i === active },
            item.kind === 'tag' && item.category != null ? tagCategoryClass(item.category) : '',
            item.kind === 'lora' ? 'tac-kind-lora' : '',
          ]"
          role="option"
          :aria-selected="i === active"
          @mouseenter="active = i"
          @click="applyAt(i)"
        >
          <span class="tac-label">
            <template v-for="(part, pi) in highlight(item.label)" :key="pi">
              <mark v-if="part.hit" class="tac-hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
            <span v-if="item.matchedAlias" class="tac-alias">← {{ item.matchedAlias }}</span>
          </span>
          <span class="tac-meta">{{ item.meta }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.prompt-textarea {
  position: relative;
}
</style>

<!-- Teleport 到 body：不用 scoped，避免样式丢失 -->
<style>
.tac-panel {
  position: fixed;
  z-index: 1200;
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px;
}

.tac-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text);
  cursor: pointer;
}

.tac-item:hover,
.tac-item.is-active {
  background: var(--bg-sidebar-item-hover);
}

.tac-label {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.tac-alias {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: 11.5px;
}

.tac-meta {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.tac-hit {
  background: transparent;
  color: inherit;
  font-weight: 700;
  padding: 0;
}

.tac-cat-general {
  color: #2563eb;
}
.tac-cat-artist {
  color: #c2410c;
}
.tac-cat-copyright {
  color: #7c3aed;
}
.tac-cat-character {
  color: #15803d;
}
.tac-cat-meta {
  color: #64748b;
}
.tac-kind-lora {
  color: #0f766e;
}

.tac-cat-general .tac-meta,
.tac-cat-artist .tac-meta,
.tac-cat-copyright .tac-meta,
.tac-cat-character .tac-meta,
.tac-cat-meta .tac-meta,
.tac-kind-lora .tac-meta {
  color: var(--text-muted);
}
</style>
