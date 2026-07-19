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
  canSearchTags,
  ensureTagDb,
  formatCount,
  isTagDbReady,
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
  translation?: string
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
  /** Only open suggestions after real typing (not format / apply / paste insertText). */
  let allowSuggestFromTyping = false
  /** True while IME composition is active (pinyin etc.). */
  let imeComposing = false
  /** Ignore stale async refresh after a newer schedule. */
  let refreshGen = 0

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

  async function refresh(): Promise<void> {
    const gen = ++refreshGen
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
    if (tok.mode === 'tag' && !canSearchTags(tok.query)) {
      hide()
      return
    }

    let next: SuggestItem[] = []
    if (tok.mode === 'lora') {
      try {
        const files = await ensureLoraList()
        if (gen !== refreshGen || document.activeElement !== ta) return
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
        if (!isTagDbReady()) await ensureTagDb()
        if (gen !== refreshGen || document.activeElement !== ta) return
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
        translation: h.translation,
        insert: formatTagInsert(h.name, family),
      }))
    }

    if (gen !== refreshGen || document.activeElement !== ta) return

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
      // IME often reports key as "Process"; still count as typing intent.
      if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.key === 'Process' ||
        e.key.length === 1
      ) {
        allowSuggestFromTyping = true
      }
    }
    // While composing, do not hijack keys for the suggestion panel.
    if (imeComposing || e.isComposing) return
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

  function onCompositionStart(): void {
    imeComposing = true
    // Avoid matching half-finished pinyin against zh translations.
    suppressSuggest()
  }

  function onCompositionEnd(): void {
    imeComposing = false
    allowSuggestFromTyping = true
    // compositionend fires before the final input in some engines — wait a tick.
    void nextTick(() => {
      scheduleRefresh()
      emitCaret()
    })
  }

  function onFocus(e: FocusEvent): void {
    clearBlurTimer()
    // Background load only — never sync-parse on the UI thread here.
    void ensureTagDb().catch((err) => {
      console.error('[tag-complete] 词库加载失败', err)
    })
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
    // During IME composition, wait for compositionend (final CJK chars).
    if (imeComposing || ie.isComposing || inputType === 'insertCompositionText') {
      emitCaret()
      return
    }
    // Confirmed IME commit — treat as typing even without a prior keydown.
    if (inputType === 'insertFromComposition') {
      allowSuggestFromTyping = true
    }
    // Format / apply use insertText without a prior typing key — do not suggest.
    if (!allowSuggestFromTyping) {
      suppressSuggest()
      emitCaret()
      return
    }
    allowSuggestFromTyping = false
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
    onCompositionStart,
    onCompositionEnd,
    onFocus,
    onBlur,
    onInput,
    onPointerCaret,
    onCaret,
    highlight,
  }
}
