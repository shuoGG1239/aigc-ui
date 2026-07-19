<script setup lang="ts">
import { computed, ref } from 'vue'
import { isProgramPoolName } from '@shared/program-pools'
import type { PromptPool } from '@shared/prompt-pool-types'

const props = defineProps<{
  pools: PromptPool[]
  selectedName: string
}>()

const emit = defineEmits<{
  select: [name: string]
  create: []
}>()

const listQuery = ref('')

const filteredPools = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return props.pools
  return props.pools.filter((p) => p.name.toLowerCase().includes(q))
})

function poolListMeta(item: PromptPool): string {
  if (isProgramPoolName(item.name)) return '—'
  return String(item.entries.length)
}
</script>

<template>
  <section class="list-panel">
    <div class="panel-header pool-list-header">
      <div class="panel-title">提示词池</div>
      <label class="pool-search pool-list-header-search">
        <svg class="pool-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.25" stroke="currentColor" stroke-width="1.5" />
          <path d="M10.2 10.2L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          v-model="listQuery"
          class="input pool-search-input"
          type="search"
          placeholder="搜索…"
          spellcheck="false"
        />
      </label>
      <button
        type="button"
        class="btn btn-ghost btn-icon pool-list-create"
        title="新建"
        aria-label="新建"
        @click="emit('create')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <div class="panel-body pool-list-body">
      <div class="pool-list-scroll">
        <button
          v-for="item in filteredPools"
          :key="item.name"
          type="button"
          class="pool-list-item"
          :class="{ active: item.name === selectedName }"
          @click="emit('select', item.name)"
        >
          <span class="pool-list-name">
            {{ item.name }}
            <span v-if="isProgramPoolName(item.name)" class="pool-builtin-tag">程序</span>
            <span v-else-if="item.builtin" class="pool-builtin-tag">内置</span>
          </span>
          <span class="pool-list-meta">{{ poolListMeta(item) }}</span>
        </button>
        <div v-if="!filteredPools.length" class="pool-entry-empty">无匹配</div>
      </div>
    </div>
  </section>
</template>
