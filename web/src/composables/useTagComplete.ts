import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import type { ModelFamily } from '@shared/family'
import {
  ensureLoraList,
  searchLoras,
  type LoraHit,
} from '@/prompt/tag-complete/lora-db'
import {
  ensureTagDb,
  formatCount,
  searchTags,
  type TagHit,
} from '@/prompt/tag-complete/tag-db'
import {
  formatLoraInsert,
  formatTagInsert,
  getCaretToken,
  type CaretToken,
} from '@/prompt/tag-complete/token'
import { fuzzyParts } from '@/utils/fuzzy'

export interface SuggestItem {
  kind: 'tag' | 'lora'
  key: string
  label: string
  meta: string
  category?: number
  insert: string
  matchedAlias?: string
}

export interface UseTagCompleteOptions {
  textareaRef: Ref<HTMLTextAreaElement | null>
  family: MaybeRefOrGetter<ModelFamily>
  model: Ref<string>
  emitCaret: () => void
  emitFocus: (e: FocusEvent) => void
  emitBlur: (e: FocusEvent) => void
}

export function useTagComplete(options: UseTagCompleteOptions) {
  const { textareaRef, model, emitCaret, emitFocus, emitBlur } = options

  const open = ref(false)
  const items = ref<SuggestItem[]>([])
  const active = ref(0)
  const token = ref<CaretToken | null>(null)
  const panelStyle = ref<Record<string, string>>({})
  let debounceTimer: number | null = null
  let blurTimer: number | null = null
  let dbReady = false
  /** Only open suggestions after real typing (not format / apply / paste insertText). */
  let allowSuggestFromTyping = false

  const hasItems = computed(() => open.value && items.value.length > 0)

  function hide(): void {
    open.value = false
    items.value = []
    active.value = 0
    token.value = null
  }

  function suppressSuggest(): void {
    if (debounceTimer != null) {
      window.clearTimeout(debounceTimer)
      debounceTimer = null
    }
    hide()
  }

  function positionPanel(): void {
    const ta = textareaRef.value
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
    const ta = textareaRef.value
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
      const family = toValue(options.family)
      next = searchTags(tok.query).map((h: TagHit) => ({
        kind: 'tag' as const,
        key: `tag:${h.name}`,
        label: formatTagInsert(h.name, family),
        meta: formatCount(h.count),
        category: h.category,
        matchedAlias: h.matchedAlias,
        insert: formatTagInsert(h.name, family),
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
    const ta = textareaRef.value
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
        const el = textareaRef.value
        if (!el) return
        el.focus()
        el.setSelectionRange(caret, caret)
      })
      return
    }
    void nextTick(() => {
      const el = textareaRef.value
      if (!el) return
      el.setSelectionRange(caret, caret)
      emitCaret()
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
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key.length === 1) {
        allowSuggestFromTyping = true
      }
    }
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
    // Do not open suggestions on focus/click — only while typing (input).
    emitFocus(e)
  }

  function onBlur(e: FocusEvent): void {
    clearBlurTimer()
    blurTimer = window.setTimeout(() => {
      blurTimer = null
      hide()
    }, 180)
    emitBlur(e)
  }

  function onInput(e: Event): void {
    const ie = e as InputEvent
    const inputType = ie.inputType
    if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
      allowSuggestFromTyping = false
      suppressSuggest()
      emitCaret()
      return
    }
    // Format / apply use insertText without a prior typing key — do not suggest.
    const ime =
      ie.isComposing ||
      inputType === 'insertCompositionText' ||
      inputType === 'insertFromComposition'
    if (!allowSuggestFromTyping && !ime) {
      suppressSuggest()
      emitCaret()
      return
    }
    if (!ime) allowSuggestFromTyping = false
    scheduleRefresh()
    emitCaret()
  }

  /** Click / select to copy — close suggestions; do not open a new list. */
  function onPointerCaret(): void {
    allowSuggestFromTyping = false
    suppressSuggest()
    emitCaret()
  }

  /** Keyboard caret moves — keep parent caret only. */
  function onCaret(): void {
    emitCaret()
  }

  function highlight(label: string) {
    const q = token.value?.query ?? ''
    if (token.value?.mode === 'lora') return fuzzyParts(label, q)
    const family = toValue(options.family)
    const qLabel = family === 'anima' ? q.replace(/_/g, ' ') : q
    return fuzzyParts(label, qLabel)
  }

  onBeforeUnmount(() => {
    if (debounceTimer != null) window.clearTimeout(debounceTimer)
    clearBlurTimer()
  })

  return {
    open,
    items,
    active,
    token,
    panelStyle,
    hasItems,
    hide,
    suppressSuggest,
    positionPanel,
    refresh,
    scheduleRefresh,
    applyAt,
    moveActive,
    onKeydown,
    onFocus,
    onBlur,
    onInput,
    onPointerCaret,
    onCaret,
    highlight,
  }
}
