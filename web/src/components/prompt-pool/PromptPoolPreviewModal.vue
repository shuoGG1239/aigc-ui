<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import type { PromptPreviewImage } from '@shared/ipc-types'

const emit = defineEmits<{
  'loading-change': [loading: boolean]
}>()

const toast = useToast()

const open = ref(false)
const loading = ref(false)
const preview = ref<{ prompt: string; images: PromptPreviewImage[] } | null>(null)

function close(): void {
  open.value = false
  preview.value = null
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function resolvePreview(prompt: string): Promise<void> {
  const text = prompt.trim()
  if (!text) {
    toast.info('空 prompt')
    return
  }
  if (loading.value) return
  loading.value = true
  emit('loading-change', true)
  try {
    const result = await window.api.promptPreview.resolve(text)
    if (!result.ok) {
      toast.info(result.reason === 'no_dir' ? '请先在设置中配置预览图目录' : '未找到预览图')
      return
    }
    preview.value = {
      prompt: text,
      images: result.images,
    }
    open.value = true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
    emit('loading-change', false)
  }
}

defineExpose({
  open: resolvePreview,
  loading,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && preview"
      class="pool-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="提示词预览图"
      @click.self="close"
    >
      <div class="pool-preview-card">
        <div class="pool-preview-header">
          <code class="pool-preview-name" :title="preview.prompt">{{ preview.prompt }}</code>
          <span class="pool-preview-count">{{ preview.images.length }} 张</span>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="关闭"
            aria-label="关闭"
            @click="close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="pool-preview-grid" :class="{ 'is-single': preview.images.length === 1 }">
          <figure v-for="img in preview.images" :key="img.path" class="pool-preview-item">
            <img
              class="pool-preview-img"
              :src="img.dataUrl"
              :alt="img.filename"
              draggable="false"
              @dragstart.prevent
            />
            <figcaption class="pool-preview-file" :title="img.filename">{{ img.filename }}</figcaption>
          </figure>
        </div>
      </div>
    </div>
  </Teleport>
</template>
