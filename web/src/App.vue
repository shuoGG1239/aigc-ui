<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const toast = useToast()
const platform = window.api?.platform ?? 'win32'

let offMetadataCopied: (() => void) | undefined

onMounted(async () => {
  await settings.load()
  offMetadataCopied = window.api.image.onMetadataCopied((result) => {
    if (result.ok) toast.ok('已复制元数据')
    else toast.error(result.message || '复制元数据失败')
  })
})

onUnmounted(() => {
  offMetadataCopied?.()
})
</script>

<template>
  <div class="app-frame" :class="[`platform-${platform}`]">
    <TitleBar />
    <div class="app-shell">
      <Sidebar />
      <main class="main">
        <div class="page-view">
          <RouterView />
        </div>
      </main>
    </div>
    <ToastHost />
  </div>
</template>
