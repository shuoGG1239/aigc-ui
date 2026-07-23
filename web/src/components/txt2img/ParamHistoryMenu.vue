<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { IconEye, IconStar } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { fuzzyMatches, fuzzyParts } from '@/utils/fuzzy'
import {
  formatHms,
  promptSummary,
  sortParamHistory,
  type ParamHistoryEntry,
} from '@/utils/param-history'

const emit = defineEmits<{
  /** Fired when the menu opens (parent should close sibling popovers). */
  open: []
}>()

const store = useTxt2ImgStore()
const toast = useToast()

const open = ref(false)
const btnRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const filterRef = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const previewStyle = ref<Record<string, string>>({})
const query = ref('')

const hoveredFingerprint = ref<string | null>(null)
const showNegative = ref(false)
const hoverTimer = ref<ReturnType<typeof setTimeout> | undefined>()
const leaveTimer = ref<ReturnType<typeof setTimeout> | undefined>()

/** path -> dataUrl | null (missing) | undefined (loading) */
const thumbCache = ref<Record<string, string | null>>({})
const thumbLoading = ref<Set<string>>(new Set())
/** 产出预览 2×2 分页 */
const PREVIEW_PAGE_SIZE = 4
const previewPage = ref(0)

const filtered = computed(() => {
  const q = query.value
  const list = store.paramHistory
  const matched = !q.trim()
    ? list
    : list.filter(
        (e) => fuzzyMatches(e.form.prompt, q) || fuzzyMatches(e.form.negativePrompt || '', q),
      )
  return sortParamHistory(matched)
})

const hoveredEntry = computed(() => {
  const fp = hoveredFingerprint.value
  if (!fp) return null
  return store.paramHistory.find((e) => e.fingerprint === fp) ?? null
})

const previewModelLabel = computed(() => {
  const form = hoveredEntry.value?.form
  if (!form) return ''
  return form.family === 'sdxl' ? form.checkpoint || '—' : form.unetModel || '—'
})

const previewPaths = computed(() => hoveredEntry.value?.previewPaths ?? [])

const previewPageCount = computed(() =>
  Math.max(1, Math.ceil(previewPaths.value.length / PREVIEW_PAGE_SIZE)),
)

const pagedPreviewPaths = computed(() => {
  const start = previewPage.value * PREVIEW_PAGE_SIZE
  return previewPaths.value.slice(start, start + PREVIEW_PAGE_SIZE)
})

const showPreviewPager = computed(() => previewPaths.value.length > 0)

function updateMenuPosition(): void {
  const el = btnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 520
  let left = rect.left + rect.width / 2 - width / 2
  left = Math.min(Math.max(8, left), window.innerWidth - width - 8)
  menuStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${width}px`,
  }
  updatePreviewPosition()
}

function updatePreviewPosition(): void {
  const menu = menuRef.value
  if (!menu || !hoveredFingerprint.value) return
  const rect = menu.getBoundingClientRect()
  const previewW = 320
  const gap = 8
  let left = rect.right + gap
  if (left + previewW > window.innerWidth - 8) {
    left = rect.left - previewW - gap
  }
  left = Math.max(8, left)
  const top = Math.min(rect.top, window.innerHeight - 24)
  previewStyle.value = {
    left: `${left}px`,
    top: `${Math.max(8, top)}px`,
    width: `${previewW}px`,
  }
}

function syncFilterInput(): void {
  const el = filterRef.value
  if (el && el.value !== query.value) el.value = query.value
}

function onFilterInput(e: Event): void {
  query.value = (e.target as HTMLInputElement).value
}

function onFilterBlur(e: FocusEvent): void {
  if (!open.value) return
  const next = e.relatedTarget
  if (next instanceof Node) {
    if (previewRef.value?.contains(next) || menuRef.value?.contains(next)) return
  }
  requestAnimationFrame(() => {
    if (!open.value) return
    // Selecting text in the preview moves focus away; don't steal it back.
    if (previewRef.value?.matches(':hover')) return
    filterRef.value?.focus()
  })
}

function clearHoverTimers(): void {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  if (leaveTimer.value) clearTimeout(leaveTimer.value)
  hoverTimer.value = undefined
  leaveTimer.value = undefined
}

function close(): void {
  open.value = false
  query.value = ''
  hoveredFingerprint.value = null
  showNegative.value = false
  previewPage.value = 0
  clearHoverTimers()
}

async function toggle(): Promise<void> {
  if (open.value) {
    close()
    return
  }
  open.value = true
  query.value = ''
  hoveredFingerprint.value = null
  emit('open')
  await nextTick()
  updateMenuPosition()
  filterRef.value?.focus()
}

function onRestore(fingerprint: string): void {
  if (store.restoreHistory(fingerprint)) {
    close()
    toast.ok('已恢复历史参数')
  }
}

function onToggleStar(fingerprint: string, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const before = store.paramHistory.find((e) => e.fingerprint === fingerprint)
  if (!store.toggleHistoryStar(fingerprint) || !before) return
  toast.ok(before.starred ? '已取消收藏' : '已收藏')
}

function onItemEnter(item: ParamHistoryEntry): void {
  if (leaveTimer.value) {
    clearTimeout(leaveTimer.value)
    leaveTimer.value = undefined
  }
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  hoverTimer.value = setTimeout(() => {
    hoveredFingerprint.value = item.fingerprint
    showNegative.value = false
    previewPage.value = 0
    void nextTick(() => {
      updatePreviewPosition()
      void loadThumbs((item.previewPaths ?? []).slice(0, PREVIEW_PAGE_SIZE))
    })
  }, 120)
}

function shiftPreviewPage(delta: number): void {
  const next = previewPage.value + delta
  if (next < 0 || next >= previewPageCount.value) return
  previewPage.value = next
  void loadThumbs(pagedPreviewPaths.value)
}

/** Wheel on 产出预览 → previous / next page. */
function onPreviewSectionWheel(e: WheelEvent): void {
  if (previewPageCount.value <= 1) return
  const delta = e.deltaY || e.deltaX
  if (!delta) return
  e.preventDefault()
  shiftPreviewPage(delta > 0 ? 1 : -1)
}

function onItemLeave(): void {
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
    hoverTimer.value = undefined
  }
  scheduleClearHover()
}

function onPreviewEnter(): void {
  if (leaveTimer.value) {
    clearTimeout(leaveTimer.value)
    leaveTimer.value = undefined
  }
}

function onPreviewLeave(): void {
  scheduleClearHover()
}

function scheduleClearHover(): void {
  if (leaveTimer.value) clearTimeout(leaveTimer.value)
  leaveTimer.value = setTimeout(() => {
    hoveredFingerprint.value = null
    previewPage.value = 0
  }, 160)
}

async function loadThumbs(paths: string[]): Promise<void> {
  for (const path of paths) {
    if (path in thumbCache.value || thumbLoading.value.has(path)) continue
    thumbLoading.value.add(path)
    try {
      const imgs = await window.api.image.loadPreviewFromPath(path, 1)
      thumbCache.value = {
        ...thumbCache.value,
        [path]: imgs[0]?.dataUrl ?? null,
      }
    } catch {
      thumbCache.value = { ...thumbCache.value, [path]: null }
    } finally {
      thumbLoading.value.delete(path)
    }
  }
}

async function onPreviewThumbClick(path: string): Promise<void> {
  if (thumbCache.value[path] === null) {
    toast.error('预览图已失效')
    return
  }
  try {
    const imgs = await window.api.image.loadPreviewFromPath(path, 1)
    const img = imgs[0]
    if (!img?.dataUrl) {
      thumbCache.value = { ...thumbCache.value, [path]: null }
      toast.error('预览图已失效')
      return
    }
    store.prependResults([
      { path: img.path, dataUrl: img.dataUrl, filename: img.filename },
    ])
    close()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onAppendAllPreviews(): Promise<void> {
  const paths = previewPaths.value
  if (!paths.length) {
    toast.info('暂无预览图')
    return
  }
  try {
    const images: { path: string; filename: string; dataUrl: string }[] = []
    for (const path of paths) {
      try {
        const imgs = await window.api.image.loadPreviewFromPath(path, 1)
        const img = imgs[0]
        if (!img?.dataUrl) {
          thumbCache.value = { ...thumbCache.value, [path]: null }
          continue
        }
        thumbCache.value = { ...thumbCache.value, [path]: img.dataUrl }
        images.push({ path: img.path, dataUrl: img.dataUrl, filename: img.filename })
      } catch {
        thumbCache.value = { ...thumbCache.value, [path]: null }
      }
    }
    if (!images.length) {
      toast.error('预览图已失效')
      return
    }
    store.prependResults(images)
    toast.ok(images.length === 1 ? '已加入预览' : `已加入 ${images.length} 张预览`)
    close()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (btnRef.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  if (previewRef.value?.contains(target)) return
  close()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (query.value) {
    e.preventDefault()
    query.value = ''
    syncFilterInput()
    return
  }
  close()
}

watch(query, () => syncFilterInput())

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    query.value = ''
    hoveredFingerprint.value = null
    clearHoverTimers()
    window.removeEventListener('resize', updateMenuPosition)
    window.removeEventListener('scroll', updateMenuPosition, true)
    document.removeEventListener('mousedown', onDocClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  clearHoverTimers()
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({
  close,
  isOpen: () => open.value,
})
</script>

<template>
  <button
    ref="btnRef"
    type="button"
    class="btn btn-ghost btn-icon"
    title="历史参数"
    aria-label="历史参数"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="toggle"
  >
    <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
      <path
        d="M512 64c247.424 0 448 200.576 448 448S759.424 960 512 960 64 759.424 64 512 264.576 64 512 64z m0 64c-212.077 0-384 171.923-384 384s171.923 384 384 384 384-171.923 384-384-171.923-384-384-384z m-32 160c35.346 0 64 28.654 64 64v128h128c34.993 0 63.426 28.084 63.991 62.942L736 544H512c-17.673 0-32-14.327-32-32V288z"
      />
    </svg>
  </button>

  <Teleport to="body">
    <input
      v-if="open"
      ref="filterRef"
      class="menu-filter-trap"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-label="过滤参数历史"
      @input="onFilterInput"
      @blur="onFilterBlur"
    />
    <div
      v-if="open"
      ref="menuRef"
      class="param-history-menu"
      role="listbox"
      :style="menuStyle"
    >
      <div
        v-for="item in filtered"
        :key="item.fingerprint + item.at"
        class="param-history-item"
        :class="{ 'is-hovered': hoveredFingerprint === item.fingerprint }"
        role="option"
        @click="onRestore(item.fingerprint)"
        @mouseenter="onItemEnter(item)"
        @mouseleave="onItemLeave"
      >
        <button
          type="button"
          class="param-history-star"
          :class="{ 'is-starred': item.starred }"
          :title="item.starred ? '取消收藏' : '收藏'"
          :aria-label="item.starred ? '取消收藏' : '收藏'"
          @click="onToggleStar(item.fingerprint, $event)"
        >
          <IconStar :filled="!!item.starred" />
        </button>
        <span class="param-history-summary" :title="item.form.prompt">
          <template v-for="(part, i) in fuzzyParts(promptSummary(item.form.prompt), query)" :key="i">
            <mark v-if="part.hit" class="menu-hl">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
        <span class="param-history-time">{{ formatHms(item.at) }}</span>
      </div>
      <div v-if="!store.paramHistory.length" class="param-history-empty">暂无历史参数</div>
      <div v-else-if="!filtered.length" class="param-history-empty">无匹配</div>
    </div>

    <div
      v-if="open && hoveredEntry"
      ref="previewRef"
      class="param-history-preview"
      :style="previewStyle"
      @mouseenter="onPreviewEnter"
      @mouseleave="onPreviewLeave"
    >
      <div class="param-history-preview-section">
        <div class="param-history-preview-label">Prompt</div>
        <div class="param-history-preview-text">
          {{ hoveredEntry.form.prompt.trim() || '（空）' }}
        </div>
      </div>
      <div class="param-history-preview-section">
        <button
          type="button"
          class="param-history-preview-label-btn"
          :aria-expanded="showNegative"
          @click.stop="showNegative = !showNegative"
        >
          <svg
            class="param-history-preview-chevron"
            :class="{ 'is-open': showNegative }"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="param-history-preview-label">Negative</span>
        </button>
        <div v-if="showNegative" class="param-history-preview-text">
          {{ hoveredEntry.form.negativePrompt.trim() || '（空）' }}
        </div>
      </div>
      <div class="param-history-preview-meta">
        <span>{{ hoveredEntry.form.family }}</span>
        <span>{{ hoveredEntry.form.width }}×{{ hoveredEntry.form.height }}</span>
        <span>steps {{ hoveredEntry.form.steps }}</span>
        <span>cfg {{ hoveredEntry.form.cfg }}</span>
        <span>{{ hoveredEntry.form.sampler }}</span>
        <span>{{ hoveredEntry.form.scheduler }}</span>
        <span>seed {{ hoveredEntry.form.seed || '随机' }}</span>
        <span class="param-history-preview-model" :title="previewModelLabel">{{
          previewModelLabel
        }}</span>
      </div>
      <div class="param-history-preview-section" @wheel="onPreviewSectionWheel">
        <div class="param-history-preview-head">
          <div class="param-history-preview-head-start">
            <div class="param-history-preview-label">产出预览</div>
            <button
              type="button"
              class="param-history-preview-eye"
              title="全部加入预览区"
              aria-label="全部加入预览区"
              :disabled="!previewPaths.length"
              @click.stop="onAppendAllPreviews"
            >
              <IconEye :size="13" />
            </button>
          </div>
          <div v-if="showPreviewPager" class="param-history-preview-pager">
            <button
              type="button"
              class="btn btn-ghost btn-icon param-history-preview-page-btn"
              title="上一页"
              aria-label="上一页"
              :disabled="previewPage <= 0"
              @click.stop="shiftPreviewPage(-1)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 4L6 8l4 4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <span class="param-history-preview-page"
              >{{ previewPage + 1 }}/{{ previewPageCount }}</span
            >
            <button
              type="button"
              class="btn btn-ghost btn-icon param-history-preview-page-btn"
              title="下一页"
              aria-label="下一页"
              :disabled="previewPage >= previewPageCount - 1"
              @click.stop="shiftPreviewPage(1)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="!previewPaths.length" class="param-history-preview-empty">暂无预览图</div>
        <div v-else class="param-history-preview-grid">
          <button
            v-for="path in pagedPreviewPaths"
            :key="path"
            type="button"
            class="param-history-preview-thumb"
            :data-image-path="thumbCache[path] ? path : undefined"
            :disabled="thumbCache[path] === null"
            :title="thumbCache[path] === null ? '预览图已失效' : '在预览区显示'"
            @click.stop="onPreviewThumbClick(path)"
          >
            <img
              v-if="thumbCache[path]"
              :src="thumbCache[path]!"
              :data-image-path="path"
              alt=""
              draggable="false"
            />
            <span v-else-if="thumbCache[path] === null" class="param-history-preview-missing"
              >已失效</span
            >
            <span v-else class="param-history-preview-missing">…</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
