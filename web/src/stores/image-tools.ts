import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GeneratedImage, Wd14TagParams } from '@shared/ipc-types'
import type { SelectOption } from '@/utils/select-options'

export type ImageToolsImage = GeneratedImage

/** Extensible image-tool ids. */
export type ImageToolId = 'wd14-tag'

export const IMAGE_TOOL_OPTIONS: SelectOption[] = [
  { value: 'wd14-tag', label: 'WD14 Tag反推' },
]

const DEFAULT_WD14 = {
  model: 'wd-swinv2-tagger-v3',
  threshold: 0.35,
  characterThreshold: 0.85,
  replaceUnderscore: true,
  trailingComma: false,
  excludeTags: '',
}

export const useImageToolsStore = defineStore('imageTools', () => {
  const images = ref<ImageToolsImage[]>([])
  const selectedIndex = ref(0)
  const running = ref(false)
  const tags = ref('')
  const lastModel = ref('')
  const error = ref('')
  const activeTool = ref<ImageToolId>('wd14-tag')

  const wd14 = reactive({ ...DEFAULT_WD14 })

  const activeToolLabel = computed(
    () => IMAGE_TOOL_OPTIONS.find((o) => o.value === activeTool.value)?.label ?? activeTool.value,
  )

  const selectedImage = computed(() => {
    const list = images.value
    if (!list.length) return null
    const i = Math.min(Math.max(0, selectedIndex.value), list.length - 1)
    return list[i] ?? null
  })

  function setActiveTool(id: string): void {
    if (!IMAGE_TOOL_OPTIONS.some((o) => o.value === id)) return
    activeTool.value = id as ImageToolId
  }

  function prependImages(list: ImageToolsImage[]): void {
    if (!list.length) return
    const seen = new Set(images.value.map((x) => x.path))
    const unique = list.filter((img) => {
      if (seen.has(img.path)) return false
      seen.add(img.path)
      return true
    })
    if (!unique.length) return
    images.value = [...unique, ...images.value].slice(0, 50)
    selectedIndex.value = 0
    tags.value = ''
    error.value = ''
  }

  function selectImage(index: number): void {
    if (!images.value.length) return
    selectedIndex.value = Math.min(Math.max(0, index), images.value.length - 1)
    tags.value = ''
    error.value = ''
  }

  function clearImages(): void {
    images.value = []
    selectedIndex.value = 0
    tags.value = ''
    error.value = ''
    lastModel.value = ''
  }

  async function runWd14Tag(): Promise<void> {
    const img = selectedImage.value
    if (!img) throw new Error('请先拖入待处理图片')
    if (running.value) throw new Error('正在反推中…')

    running.value = true
    error.value = ''
    tags.value = ''
    try {
      const params: Wd14TagParams = {
        imagePath: img.path,
        model: wd14.model,
        threshold: wd14.threshold,
        characterThreshold: wd14.characterThreshold,
        replaceUnderscore: wd14.replaceUnderscore,
        trailingComma: wd14.trailingComma,
        excludeTags: wd14.excludeTags,
      }
      const result = await window.api.imageTools.wd14Tag(params)
      tags.value = result.tags
      lastModel.value = result.model
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      throw err
    } finally {
      running.value = false
    }
  }

  async function runActiveTool(): Promise<void> {
    if (activeTool.value === 'wd14-tag') {
      await runWd14Tag()
      return
    }
    throw new Error(`未知工具: ${activeTool.value}`)
  }

  return {
    images,
    selectedIndex,
    selectedImage,
    running,
    tags,
    lastModel,
    error,
    wd14,
    activeTool,
    activeToolLabel,
    setActiveTool,
    prependImages,
    selectImage,
    clearImages,
    runWd14Tag,
    runActiveTool,
  }
})
