<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SelectOption } from '@/utils/select-options'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    placeholder?: string
    variant?: 'default' | 'compact'
    disabled?: boolean
  }>(),
  {
    placeholder: '请选择',
    variant: 'default',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const label = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue)
  return hit?.label ?? props.placeholder
})

function updateMenuPosition(): void {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxHeight = 260
  const spaceBelow = window.innerHeight - rect.bottom - 8
  const openUp = spaceBelow < 160 && rect.top > spaceBelow

  menuStyle.value = {
    left: `${rect.left}px`,
    width: `${Math.max(rect.width, 160)}px`,
    maxHeight: `${maxHeight}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 4}px`, top: 'auto' }
      : { top: `${rect.bottom + 4}px`, bottom: 'auto' }),
  }
}

async function toggle(): Promise<void> {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updateMenuPosition()
  }
}

function select(value: string): void {
  emit('update:modelValue', value)
  open.value = false
}

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  const menus = document.querySelectorAll('.app-select-menu')
  for (const menu of menus) {
    if (menu.contains(target)) return
  }
  open.value = false
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}

watch(open, (v) => {
  if (v) {
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
  } else {
    window.removeEventListener('resize', updateMenuPosition)
    window.removeEventListener('scroll', updateMenuPosition, true)
    document.removeEventListener('mousedown', onDocClick)
    document.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="app-select" :class="[`app-select--${variant}`]">
    <button
      ref="triggerRef"
      type="button"
      class="app-select-trigger"
      :class="{ open }"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="app-select-value">{{ label }}</span>
      <span class="app-select-chevron">▾</span>
    </button>
    <Teleport to="body">
      <div v-if="open" class="app-select-menu" :style="menuStyle">
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="app-select-option"
          :class="{ active: opt.value === modelValue }"
          @click="select(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
