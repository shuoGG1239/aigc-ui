<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import PromptPoolPreviewModal from '@/components/prompt-pool/PromptPoolPreviewModal.vue'
import { useToast } from '@/composables/useToast'
import { preloadTagDb } from '@/prompt/tag-complete/tag-db'
import { useSettingsStore } from '@/stores/settings'
import { useTxt2ImgStore } from '@/stores/txt2img'

const settings = useSettingsStore()
const txt2img = useTxt2ImgStore()
const toast = useToast()
const platform = window.api?.platform ?? 'win32'
const tagPreviewRef = ref<InstanceType<typeof PromptPoolPreviewModal> | null>(null)

let offMetadataCopied: (() => void) | undefined
let offViewTag: (() => void) | undefined

onMounted(async () => {
  await settings.load()
  txt2img.applyParamHistoryMax()
  offMetadataCopied = window.api.image.onMetadataCopied((result) => {
    if (result.ok) toast.ok('已复制元数据')
    else toast.error(result.message || '复制元数据失败')
  })
  offViewTag = window.api.promptPreview.onViewTag((prompt) => {
    void tagPreviewRef.value?.open(prompt)
  })
  // Parse tag CSV while idle so the first prompt focus/type is less likely to hitch.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => preloadTagDb(), { timeout: 1200 })
  } else {
    window.setTimeout(() => preloadTagDb(), 200)
  }
})

onUnmounted(() => {
  offMetadataCopied?.()
  offViewTag?.()
})
</script>

<template>
  <div class="app-frame" :class="[`platform-${platform}`]">
    <TitleBar />
    <div class="app-shell">
      <Sidebar />
      <main class="main">
        <div class="page-view">
          <RouterView v-slot="{ Component }">
            <!-- Keep txt2img mounted so preview dataUrls are not re-decoded on every visit. -->
            <KeepAlive :include="['Txt2ImgView']">
              <component :is="Component" />
            </KeepAlive>
          </RouterView>
        </div>
      </main>
    </div>
    <ToastHost />
    <PromptPoolPreviewModal ref="tagPreviewRef" />
  </div>
</template>
