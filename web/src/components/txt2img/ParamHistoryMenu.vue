<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { IconStar } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { fuzzyMatches, fuzzyParts } from '@/utils/fuzzy'
import { formatHms, promptSummary, sortParamHistory } from '@/utils/param-history'

const emit = defineEmits<{
  /** Fired when the menu opens (parent should close sibling popovers). */
  open: []
}>()

const store = useTxt2ImgStore()
const toast = useToast()

const open = ref(false)
const btnRef = ref<HTMLButtonElement | null>(null)
const filterRef = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const query = ref('')

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

function updateMenuPosition(): void {
  const el = btnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 520
  // Center under the trigger so extra width extends both left and right.
  let left = rect.left + rect.width / 2 - width / 2
  left = Math.min(Math.max(8, left), window.innerWidth - width - 8)
  menuStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${width}px`,
  }
}

function syncFilterInput(): void {
  const el = filterRef.value
  if (el && el.value !== query.value) el.value = query.value
}

function onFilterInput(e: Event): void {
  query.value = (e.target as HTMLInputElement).value
}

function onFilterBlur(): void {
  if (!open.value) return
  requestAnimationFrame(() => {
    if (open.value) filterRef.value?.focus()
  })
}

function close(): void {
  open.value = false
  query.value = ''
}

async function toggle(): Promise<void> {
  if (open.value) {
    close()
    return
  }
  open.value = true
  query.value = ''
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

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (btnRef.value?.contains(target)) return
  const menu = document.querySelector('.param-history-menu')
  if (menu?.contains(target)) return
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
    window.removeEventListener('resize', updateMenuPosition)
    window.removeEventListener('scroll', updateMenuPosition, true)
    document.removeEventListener('mousedown', onDocClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
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
    <div v-if="open" class="param-history-menu" role="listbox" :style="menuStyle">
      <div
        v-for="item in filtered"
        :key="item.fingerprint + item.at"
        class="param-history-item"
        role="option"
        @click="onRestore(item.fingerprint)"
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
  </Teleport>
</template>
