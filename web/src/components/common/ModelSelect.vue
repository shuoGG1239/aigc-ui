<script setup lang="ts">
import { ref, watch } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import { useToast } from '@/composables/useToast'
import type { SelectOption } from '@/utils/select-options'

/** Logical model slots in our UI → ComfyUI `/models/{folder}` names. */
export type ModelSlot = 'checkpoint' | 'unet' | 'clip' | 'vae'

const FOLDER_BY_SLOT: Record<ModelSlot, string> = {
  checkpoint: 'checkpoints',
  unet: 'diffusion_models',
  clip: 'text_encoders',
  vae: 'vae',
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    folder: ModelSlot
    placeholder?: string
  }>(),
  {
    placeholder: '选择模型',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const toast = useToast()
const options = ref<SelectOption[]>([])
const loading = ref(false)
const emptyText = ref('暂无模型')
let loadSeq = 0

watch(
  () => props.folder,
  () => {
    options.value = []
  },
)

async function onOpen(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  emptyText.value = '暂无模型'
  const apiFolder = FOLDER_BY_SLOT[props.folder]
  try {
    const names = await window.api.comfy.listModels(apiFolder)
    if (seq !== loadSeq) return
    options.value = names.map((name) => ({ label: name, value: name }))
    if (!names.length) {
      emptyText.value = `未找到 ${apiFolder} 模型`
    }
  } catch (err) {
    if (seq !== loadSeq) return
    options.value = []
    emptyText.value = '加载失败'
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
</script>

<template>
  <AppSelect
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder"
    :loading="loading"
    :empty-text="emptyText"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  />
</template>
