<script setup lang="ts">
import { ref, watch } from 'vue'
import { IconShredder } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { useTxt2ImgStore } from '@/stores/txt2img'
import { parseImageMeta } from '@/utils/image-meta'

const emit = defineEmits<{
  /** Parent should load selected image metadata into the form. */
  'apply-meta': []
}>()

const store = useTxt2ImgStore()
const toast = useToast()

const infoOpen = ref(false)
const infoRaw = ref('')
const infoSummary = ref<{
  source: string
  prompt: string
  negativePrompt: string
  size: string
  steps: string
  cfg: string
  sampler: string
  scheduler: string
  seed: string
  family: string
  model: string
  filename: string
  path: string
} | null>(null)

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

async function onToggleImageInfo(): Promise<void> {
  if (infoOpen.value) {
    infoOpen.value = false
    return
  }
  const img = store.selectedImage
  if (!img) return
  try {
    const info = await window.api.image.readMetadata(img.path)
    const payload = { path: img.path, filename: img.filename, ...info }
    infoRaw.value = JSON.stringify(payload, null, 2)

    const { meta } = parseImageMeta(info)
    const sourceLabel =
      meta.source === 'comfyui'
        ? 'ComfyUI'
        : meta.source === 'a1111'
          ? 'A1111'
          : meta.source === 'novelai'
            ? 'NovelAI'
            : 'Unknown'
    infoSummary.value = {
      source: sourceLabel,
      prompt: meta.prompt.trim() || '—',
      negativePrompt: meta.negativePrompt.trim() || '—',
      size:
        meta.width != null && meta.height != null ? `${meta.width} × ${meta.height}` : '—',
      steps: meta.steps != null ? String(meta.steps) : '—',
      cfg: meta.cfg != null ? String(meta.cfg) : '—',
      sampler: meta.sampler || '—',
      scheduler: meta.scheduler || '—',
      seed: meta.seed.trim() ? meta.seed : '—',
      family: meta.family ? meta.family.toUpperCase() : '—',
      model: meta.model || '—',
      filename: img.filename,
      path: img.path,
    }

    infoOpen.value = true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

watch(
  () => store.selectedImage?.path,
  () => {
    infoOpen.value = false
    infoSummary.value = null
    infoRaw.value = ''
  },
)

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
    toast.error('请拖入 PNG 图片或文件夹')
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
      throw new Error(errors[0] || '未能加载 PNG')
    }
    const seen = new Set<string>()
    const unique = images.filter((img) => {
      if (seen.has(img.path)) return false
      seen.add(img.path)
      return true
    })
    store.prependResults(unique)
    toast.ok(unique.length === 1 ? '已加载 PNG' : `已加载 ${unique.length} 张 PNG`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function onResultListWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  if (!el || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY || e.deltaX
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
          @click="store.clearResults()"
        >
          <IconShredder />
        </button>
      </div>
    </div>
    <div class="panel-body">
      <div class="preview-area">
        <div class="preview-main">
          <img
            v-if="store.selectedImage"
            :src="store.selectedImage.dataUrl"
            :alt="store.selectedImage.filename"
            :data-image-path="store.selectedImage.path"
            draggable="false"
            @dragstart.prevent
          />
          <div v-else class="empty-state">
            <div class="title">尚未生成</div>
            <div class="hint">填写提示词后点击「生成」</div>
          </div>

          <div v-if="store.selectedImage" class="preview-float-actions">
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="应用图片到参数"
              aria-label="应用图片到参数"
              @click="emit('apply-meta')"
            >
              <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                <path
                  d="M744 112c17.673 0 32 14.327 32 32v240.873c-35.346 0-64-28.653-64-64L711.999 176h-536v672h229.582c34.993 0 63.426 28.084 63.991 62.942l0.01 1.058H144c-17.673 0-32-14.327-32-32V144c0-17.673 14.327-32 32-32h600z m23.243 419.26l135.764 135.764c12.497 12.497 12.497 32.758 0 45.255L767.243 848.043c-24.994-24.993-24.994-65.516 0-90.51L802.773 722H310c-35.346 0-64-28.654-64-64h557.474l-36.231-36.23c-24.744-24.744-24.991-64.708-0.743-89.756l0.743-0.754zM408 424c30.619 0 55.498 24.573 55.992 55.074L464 480H302c-30.928 0-56-25.072-56-56h162z m178-156c30.619 0 55.498 24.573 55.992 55.074L642 324H302c-30.928 0-56-25.072-56-56h340z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title="查看图片信息"
              aria-label="查看图片信息"
              :class="{ 'is-active': infoOpen }"
              @click="onToggleImageInfo"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />
                <path
                  d="M8 7.25V11M8 5.15v.2"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div v-if="infoOpen && infoSummary" class="preview-info-panel">
            <div class="preview-info-header">
              <span>图片信息</span>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="关闭"
                aria-label="关闭"
                @click="infoOpen = false"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 4.5l7 7M11.5 4.5l-7 7"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
            <div class="preview-info-body">
              <div class="preview-info-summary">
                <div class="preview-info-block">
                  <div class="preview-info-label">Prompt</div>
                  <div class="preview-info-prompt">{{ infoSummary.prompt }}</div>
                </div>
                <div class="preview-info-block">
                  <div class="preview-info-label">Negative</div>
                  <div class="preview-info-prompt is-muted">{{ infoSummary.negativePrompt }}</div>
                </div>
                <div class="preview-info-chips">
                  <span class="preview-info-chip">{{ infoSummary.source }}</span>
                  <span v-if="infoSummary.family !== '—'" class="preview-info-chip">{{
                    infoSummary.family
                  }}</span>
                  <span class="preview-info-chip">{{ infoSummary.size }}</span>
                  <span class="preview-info-chip">{{ infoSummary.steps }} steps</span>
                  <span class="preview-info-chip">CFG {{ infoSummary.cfg }}</span>
                  <span class="preview-info-chip">{{ infoSummary.sampler }}</span>
                  <span class="preview-info-chip">{{ infoSummary.scheduler }}</span>
                  <span class="preview-info-chip">seed {{ infoSummary.seed }}</span>
                </div>
                <div class="preview-info-meta">
                  <div class="preview-info-row">
                    <span class="preview-info-label">Model</span>
                    <span class="preview-info-value" :title="infoSummary.model">{{
                      infoSummary.model
                    }}</span>
                  </div>
                  <div class="preview-info-row">
                    <span class="preview-info-label">File</span>
                    <span class="preview-info-value" :title="infoSummary.path">{{
                      infoSummary.filename
                    }}</span>
                  </div>
                </div>
              </div>

              <div class="preview-info-block">
                <div class="preview-info-label">原始详情</div>
                <pre class="preview-info-raw">{{ infoRaw }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div v-if="store.results.length" class="result-list" @wheel.prevent="onResultListWheel">
          <button
            v-for="(img, i) in store.results"
            :key="img.path + i"
            type="button"
            class="result-thumb"
            :class="{ active: i === store.selectedIndex }"
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
