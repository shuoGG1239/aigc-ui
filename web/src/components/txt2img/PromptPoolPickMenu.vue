<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { nextLiteralPrompt, nextPoolPrompt } from '@/prompt/prompt-pool-engine'
import { isProgramPoolName } from '@shared/program-pools'
import type { PromptPool, PromptPoolEntry } from '@shared/prompt-pool-types'
import { usePromptPoolStore } from '@/stores/prompt-pool'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { fuzzyMatches, fuzzyParts } from '@/utils/fuzzy'

const emit = defineEmits<{
  open: []
  /** Sampled / chosen prompt text to append into the focused field. */
  pick: [text: string]
}>()

const store = useTxt2ImgStore()
const poolStore = usePromptPoolStore()
const toast = useToast()

const open = ref(false)
const btnRef = ref<HTMLButtonElement | null>(null)
const filterRef = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const submenuPool = ref<string | null>(null)
const submenuStyle = ref<Record<string, string>>({})
const query = ref('')
let submenuCloseTimer: number | null = null

function poolMenuEntries(pool: PromptPool): PromptPoolEntry[] {
  if (isProgramPoolName(pool.name)) return []
  return pool.entries.filter((e) => e.prompt.trim())
}

function filterPoolEntries(
  pool: PromptPool,
  entries: PromptPoolEntry[],
  q: string,
): PromptPoolEntry[] {
  if (!q.trim()) return entries
  const matched = entries.filter((e) => fuzzyMatches(e.prompt, q))
  if (matched.length) return matched
  if (fuzzyMatches(pool.name, q)) return entries
  return []
}

function poolMatchesQuery(pool: PromptPool, q: string): boolean {
  if (!q.trim()) return true
  if (fuzzyMatches(pool.name, q)) return true
  return poolMenuEntries(pool).some((e) => fuzzyMatches(e.prompt, q))
}

const filteredPools = computed(() => {
  const q = query.value
  const list = poolStore.pools
  if (!q.trim()) return list
  return list.filter((p) => poolMatchesQuery(p, q))
})

const filteredSubmenuEntries = computed(() => {
  if (!submenuPool.value) return []
  const pool = poolStore.getByName(submenuPool.value)
  if (!pool) return []
  return filterPoolEntries(pool, poolMenuEntries(pool), query.value)
})

function updateMenuPosition(): void {
  const el = btnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 240
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
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
  const entries = filterPoolEntries(pool, poolMenuEntries(pool), query.value)
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

function close(): void {
  open.value = false
  query.value = ''
  closeSubmenu()
}

function finishPick(sampled: string): void {
  const text = sampled.trim()
  if (!text) {
    toast.error('该提示词池未产出内容（检查条目/占比）')
    return
  }
  close()
  emit('pick', text)
}

function onInsertPoolToken(name: string): void {
  finishPick(`<pool:${name}>`)
}

function onSamplePromptPool(name: string): void {
  const pool = poolStore.getByName(name)
  if (!pool) return
  finishPick(nextPoolPrompt(pool, store.form.family))
}

function onPickPromptEntry(prompt: string): void {
  finishPick(nextLiteralPrompt(prompt, store.form.family))
}

async function toggle(): Promise<void> {
  if (open.value) {
    close()
    return
  }
  emit('open')
  await poolStore.hydrate()
  if (!poolStore.pools.length) {
    toast.info('请先在「提示词池」页创建')
    return
  }
  open.value = true
  query.value = ''
  await nextTick()
  updateMenuPosition()
  filterRef.value?.focus()
}

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (btnRef.value?.contains(target)) return
  const menu = document.querySelector('.prompt-pool-pick-menu')
  if (menu?.contains(target)) return
  const sub = document.querySelector('.prompt-pool-pick-submenu')
  if (sub?.contains(target)) return
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

watch(query, () => {
  syncFilterInput()
  if (!submenuPool.value) return
  if (!filteredPools.value.some((p) => p.name === submenuPool.value)) {
    closeSubmenu()
    return
  }
  if (!filteredSubmenuEntries.value.length) closeSubmenu()
})

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    query.value = ''
    closeSubmenu()
    window.removeEventListener('resize', updateMenuPosition)
    window.removeEventListener('scroll', updateMenuPosition, true)
    document.removeEventListener('mousedown', onDocClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  closeSubmenu()
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
    title="提示词池（追加到当前输入框）"
    aria-label="提示词池"
    aria-haspopup="menu"
    :aria-expanded="open"
    @click="toggle"
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

  <Teleport to="body">
    <input
      v-if="open"
      ref="filterRef"
      class="menu-filter-trap"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-label="过滤提示词池"
      @input="onFilterInput"
      @blur="onFilterBlur"
    />
    <div v-if="open" class="prompt-pool-pick-menu" role="menu" :style="menuStyle">
      <div
        v-for="item in filteredPools"
        :key="item.name"
        class="prompt-pool-pick-row"
        @mouseenter="onPoolRowEnter(item, $event)"
        @mouseleave="onPoolRowLeave"
      >
        <button
          type="button"
          class="prompt-pool-pick-item"
          role="menuitem"
          :title="'插入 &lt;pool:' + item.name + '&gt;'"
          :aria-haspopup="poolMenuEntries(item).length ? 'menu' : undefined"
          :aria-expanded="submenuPool === item.name || undefined"
          @click="onInsertPoolToken(item.name)"
        >
          <span class="prompt-pool-pick-name">
            <template v-for="(part, i) in fuzzyParts(item.name, query)" :key="i">
              <mark v-if="part.hit" class="menu-hl">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
          <svg
            v-if="filterPoolEntries(item, poolMenuEntries(item), query).length"
            class="prompt-pool-pick-chevron"
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
          class="prompt-pool-pick-dice"
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
      <div v-if="!filteredPools.length" class="prompt-pool-pick-empty">无匹配</div>
    </div>
    <div
      v-if="open && submenuPool && filteredSubmenuEntries.length"
      class="prompt-pool-pick-submenu"
      role="menu"
      :style="submenuStyle"
      @mouseenter="clearSubmenuCloseTimer"
      @mouseleave="onPoolRowLeave"
    >
      <button
        v-for="(entry, index) in filteredSubmenuEntries"
        :key="submenuPool + ':' + index"
        type="button"
        class="prompt-pool-pick-item prompt-pool-pick-subitem"
        role="menuitem"
        :class="{ 'is-off': entry.weight <= 0 }"
        :title="entry.prompt"
        @click="onPickPromptEntry(entry.prompt)"
      >
        <span class="prompt-pool-pick-name">
          <template v-for="(part, i) in fuzzyParts(entry.prompt, query)" :key="i">
            <mark v-if="part.hit" class="menu-hl">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
      </button>
    </div>
  </Teleport>
</template>
