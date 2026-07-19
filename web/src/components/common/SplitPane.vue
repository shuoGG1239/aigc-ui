<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Initial left width in px (converted to a ratio once the pane is measured). */
    defaultWidth?: number
    minWidth?: number
    /**
     * Optional absolute max left width in px (e.g. pool list).
     * Omit for pure proportional scaling (txt2img).
     */
    maxWidth?: number
    /** Max left share of the split root. Default 0.72. */
    maxRatio?: number
    storageKey?: string
  }>(),
  {
    defaultWidth: 624,
    minWidth: 360,
    maxRatio: 0.72,
  },
)

const rootRef = ref<HTMLElement | null>(null)
const leftWidth = ref(props.defaultWidth)
/** Intended left share (0–1). Not rewritten when min/max clamps display width. */
const leftRatio = ref(0.5)
const dragging = ref(false)
let resizeObserver: ResizeObserver | null = null

function rootWidth(): number {
  return rootRef.value?.clientWidth ?? 0
}

function maxLeftPx(total: number): number {
  const byRatio = Math.floor(total * props.maxRatio)
  if (props.maxWidth == null || !Number.isFinite(props.maxWidth)) {
    return byRatio
  }
  return Math.min(props.maxWidth, byRatio)
}

function clampWidth(px: number, total: number): number {
  if (total <= 0) {
    const cap = props.maxWidth ?? Number.POSITIVE_INFINITY
    return Math.min(cap, Math.max(props.minWidth, Math.round(px)))
  }
  const max = maxLeftPx(total)
  const min = Math.min(props.minWidth, max)
  return Math.min(max, Math.max(min, Math.round(px)))
}

function widthToRatio(px: number, total: number): number {
  if (total <= 0) return 0.5
  return clampWidth(px, total) / total
}

/** Apply stored ratio → display width. Never mutate leftRatio here. */
function applyRatio(): void {
  const total = rootWidth()
  if (total <= 0) return
  leftWidth.value = clampWidth(leftRatio.value * total, total)
}

function loadRatio(): number {
  const total = rootWidth()
  const fallback = widthToRatio(props.defaultWidth, total || 1200)
  const lo = 0.08
  const hi = props.maxRatio

  if (!props.storageKey) return fallback
  try {
    const raw = localStorage.getItem(props.storageKey)
    if (raw == null || raw === '') return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return fallback
    // Legacy: pixel widths were stored as integers > 1.
    if (n > 1) {
      return widthToRatio(n, total || 1200)
    }
    return Math.min(hi, Math.max(lo, n))
  } catch {
    return fallback
  }
}

function saveRatio(): void {
  if (!props.storageKey) return
  try {
    localStorage.setItem(props.storageKey, String(leftRatio.value))
  } catch {
    // ignore
  }
}

function onPointerDown(e: PointerEvent): void {
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  dragging.value = true
  document.body.classList.add('is-resizing-split')
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || !rootRef.value) return
  const rect = rootRef.value.getBoundingClientRect()
  if (rect.width <= 0) return
  const px = clampWidth(e.clientX - rect.left, rect.width)
  leftWidth.value = px
  // User intent: ratio of the unclamped pointer when possible; use displayed px / total.
  leftRatio.value = px / rect.width
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  const handle = e.currentTarget as HTMLElement
  try {
    handle.releasePointerCapture(e.pointerId)
  } catch {
    // ignore
  }
  dragging.value = false
  document.body.classList.remove('is-resizing-split')
  saveRatio()
}

function onWindowResize(): void {
  if (dragging.value) return
  // Electron maximize often settles one frame after the first resize event.
  applyRatio()
  requestAnimationFrame(() => {
    if (!dragging.value) applyRatio()
  })
}

onMounted(() => {
  leftRatio.value = loadRatio()
  applyRatio()
  saveRatio()

  window.addEventListener('resize', onWindowResize)

  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (dragging.value) return
      applyRatio()
    })
    resizeObserver.observe(rootRef.value)
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('is-resizing-split')
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div ref="rootRef" class="split-pane" :class="{ 'is-dragging': dragging }">
    <div class="split-pane-left" :style="{ width: `${leftWidth}px` }">
      <slot name="left" />
    </div>
    <div
      class="split-resizer"
      role="separator"
      aria-orientation="vertical"
      title="拖动调整宽度"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="split-pane-right">
      <slot name="right" />
    </div>
  </div>
</template>
