<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
    storageKey?: string
  }>(),
  {
    defaultWidth: 624,
    minWidth: 360,
    maxWidth: 900,
  },
)

const rootRef = ref<HTMLElement | null>(null)
const leftWidth = ref(props.defaultWidth)
const dragging = ref(false)

function loadWidth(): number {
  if (!props.storageKey) return props.defaultWidth
  try {
    const raw = localStorage.getItem(props.storageKey)
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n)) return clamp(n)
  } catch {
    // ignore
  }
  return props.defaultWidth
}

function clamp(n: number): number {
  const root = rootRef.value
  const maxByRoot = root ? Math.floor(root.clientWidth * 0.72) : props.maxWidth
  const max = Math.min(props.maxWidth, maxByRoot)
  return Math.min(max, Math.max(props.minWidth, Math.round(n)))
}

function saveWidth(): void {
  if (!props.storageKey) return
  try {
    localStorage.setItem(props.storageKey, String(leftWidth.value))
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
  leftWidth.value = clamp(e.clientX - rect.left)
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
  saveWidth()
}

onMounted(() => {
  leftWidth.value = loadWidth()
})

onBeforeUnmount(() => {
  document.body.classList.remove('is-resizing-split')
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
