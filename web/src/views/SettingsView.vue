<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const toast = useToast()
const serverUrlDraft = ref(settings.serverUrl)
const savingUrl = ref(false)

watch(
  () => settings.serverUrl,
  (url) => {
    serverUrlDraft.value = url
  },
)

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

async function onPickPreviewDir(): Promise<void> {
  await settings.pickPromptPreviewDir()
  if (settings.promptPreviewDir) {
    toast.ok('预览图目录已更新')
  }
}

async function onOpenPreviewDir(): Promise<void> {
  try {
    await settings.openPromptPreviewDir()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onSaveServerUrl(): Promise<void> {
  savingUrl.value = true
  try {
    const serverUrl = serverUrlDraft.value.trim().replace(/\/$/, '')
    if (!serverUrl) {
      throw new Error('请填写服务地址')
    }
    await settings.save({ serverUrl })
    toast.ok('服务地址已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    savingUrl.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div class="panel-title" title="ComfyUI HTTP 地址">服务地址</div>
        <div class="path-row settings-path">
          <input
            v-model="serverUrlDraft"
            class="input"
            type="text"
            placeholder="http://127.0.0.1:8188"
            title="ComfyUI HTTP 地址"
            @keydown.enter="onSaveServerUrl"
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="保存"
            aria-label="保存服务地址"
            :disabled="savingUrl"
            @click="onSaveServerUrl"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3.5 3.5h7.2L12.5 5.3V12.5h-9V3.5z"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
              <path d="M5.5 3.5v3h4v-3M5.5 12.5v-4h5v4" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </button>
        </div>
      </div>
    </section>

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
            title="选择目录"
            aria-label="选择目录"
            @click="onPickDir"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 4.5h3.6l1.1 1.4H10.5V8"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                d="M2 4.5v7.5h6.25"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                d="M12.25 9.25v5M9.75 11.75h5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>

    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div
          class="panel-title"
          title="提示词池眼睛预览：文件名（不含扩展名）与标准化后的 prompt 匹配，如 akamoku.jpg ↔ @akamoku"
        >
          预览图目录
        </div>
        <div class="path-row settings-path">
          <input
            class="input"
            type="text"
            :value="settings.promptPreviewDir"
            readonly
            placeholder="未配置"
            title="提示词预览图目录"
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="在资源管理器中打开"
            aria-label="在资源管理器中打开"
            :disabled="!settings.promptPreviewDir"
            @click="onOpenPreviewDir"
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
            title="选择目录"
            aria-label="选择目录"
            @click="onPickPreviewDir"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 4.5h3.6l1.1 1.4H10.5V8"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                d="M2 4.5v7.5h6.25"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                d="M12.25 9.25v5M9.75 11.75h5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
