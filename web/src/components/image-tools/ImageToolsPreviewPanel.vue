<script setup lang="ts">
import { ref } from 'vue'
import { IconShredder } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { useImageToolsStore } from '@/stores/image-tools'

const store = useImageToolsStore()
const toast = useToast()

const previewDragOver = ref(false)
let previewDragDepth = 0

async function onOpenPreviewFolder(): Promise<void> {
  try {
    const path = store.selectedImage?.path
    if (path) {
      await window.api.shell.showItemInFolder(path)
    } else {
      await window.api.settings.openOutputDir()
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onOpenPreviewImage(): Promise<void> {
  const path = store.selectedImage?.path
  if (!path) return
  try {
    await window.api.shell.openPath(path)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onPreviewDragEnter(e: DragEvent): void {
  e.preventDefault()
  previewDragDepth += 1
  previewDragOver.value = true
}

function onPreviewDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  previewDragOver.value = true
}

function onPreviewDragLeave(e: DragEvent): void {
  e.preventDefault()
  previewDragDepth -= 1
  if (previewDragDepth <= 0) {
    previewDragDepth = 0
    previewDragOver.value = false
  }
}

async function onPreviewDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  previewDragDepth = 0
  previewDragOver.value = false

  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) {
    toast.error('请拖入图片或文件夹')
    return
  }

  try {
    const images: { path: string; filename: string; dataUrl: string }[] = []
    const errors: string[] = []
    for (const file of files) {
      const targetPath = window.api.getPathForFile(file)
      if (!targetPath) {
        errors.push('无法读取拖入路径')
        continue
      }
      try {
        const loaded = await window.api.image.loadPreviewFromPath(targetPath, 10)
        images.push(...loaded)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (!images.length) {
      throw new Error(errors[0] || '未能加载图片')
    }
    const seen = new Set<string>()
    const unique = images.filter((img) => {
      if (seen.has(img.path)) return false
      seen.add(img.path)
      return true
    })
    store.prependImages(unique)
    toast.ok(unique.length === 1 ? '已加载图片' : `已加载 ${unique.length} 张图片`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onResultListWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  if (!el || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY || e.deltaX
}

function onPreviewMainWheel(e: WheelEvent): void {
  if (store.images.length <= 1) return
  const delta = e.deltaY || e.deltaX
  if (!delta) return
  e.preventDefault()
  store.selectImage(store.selectedIndex + (delta > 0 ? 1 : -1))
}
</script>

<template>
  <section
    class="detail-panel"
    :class="{ 'is-drop-target': previewDragOver }"
    @dragenter="onPreviewDragEnter"
    @dragover="onPreviewDragOver"
    @dragleave="onPreviewDragLeave"
    @drop="onPreviewDrop"
  >
    <div class="panel-header">
      <div class="panel-title">预览</div>
      <div class="form-actions" style="padding-top: 0">
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          title="打开文件夹"
          aria-label="打开文件夹"
          @click="onOpenPreviewFolder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 4.5h4l1.2 1.5H13.5v6.5H2.5V4.5z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          title="清空预览"
          aria-label="清空预览"
          @click="store.clearImages()"
        >
          <IconShredder />
        </button>
      </div>
    </div>
    <div class="panel-body">
      <div class="preview-area">
        <div class="preview-main" @wheel="onPreviewMainWheel">
          <img
            v-if="store.selectedImage"
            :src="store.selectedImage.dataUrl"
            :alt="store.selectedImage.filename"
            :data-image-path="store.selectedImage.path"
            draggable="false"
            @dragstart.prevent
            @click="onOpenPreviewImage"
          />
          <div v-else class="empty-state">
            <div class="title">拖入图片</div>
            <div class="hint">支持 PNG / JPG / WebP，可拖文件夹</div>
          </div>
        </div>

        <div v-if="store.images.length" class="result-list" @wheel.prevent="onResultListWheel">
          <button
            v-for="(img, i) in store.images"
            :key="img.path + i"
            type="button"
            class="result-thumb"
            :class="{ active: i === store.selectedIndex }"
            :data-image-path="img.path"
            draggable="false"
            @click="store.selectImage(i)"
            @dragstart.prevent
          >
            <img
              :src="img.dataUrl"
              :alt="img.filename"
              :data-image-path="img.path"
              draggable="false"
            />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
