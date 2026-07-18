<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const platform = window.api?.platform ?? 'win32'

onMounted(async () => {
  await settings.load()
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
