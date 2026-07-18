<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const toast = useToast()

async function onPickDir(): Promise<void> {
  await settings.pickOutputDir()
  if (settings.outputDir) {
    toast.ok('输出目录已更新')
  }
}

async function onOpenDir(): Promise<void> {
  try {
    await settings.openOutputDir()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}
</script>

<template>
  <div class="page-shell">
    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div class="panel-title" title="生成结果自动保存到此目录">输出目录</div>
        <div class="path-row settings-path">
          <input
            class="input"
            type="text"
            :value="settings.outputDir"
            readonly
            title="生成结果自动保存到此目录"
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="在资源管理器中打开"
            aria-label="在资源管理器中打开"
            @click="onOpenDir"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6.5 3.5H3.5v9h9V9.5M9.5 3.5H12.5V6.5M12.5 3.5L7.5 8.5"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="选择目录"
            aria-label="选择目录"
            @click="onPickDir"
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
        </div>
      </div>
    </section>
  </div>
</template>
