<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { IconSave, IconShredder } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { useComfyProcessStore } from '@/stores/comfy-process'
import { useSettingsStore } from '@/stores/settings'

const processStore = useComfyProcessStore()
const settings = useSettingsStore()
const toast = useToast()
const logEl = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const saving = ref(false)
const launchCommandDraft = ref(settings.launchCommand)

watch(
  () => settings.launchCommand,
  (launchCommand) => {
    launchCommandDraft.value = launchCommand
  },
)

async function scrollToBottom(): Promise<void> {
  await nextTick()
  if (autoScroll.value && logEl.value) {
    logEl.value.scrollTop = logEl.value.scrollHeight
  }
}

watch(
  () => processStore.logs.length,
  () => {
    void scrollToBottom()
  },
)

async function persistLaunchCommand(force = false): Promise<void> {
  const launchCommand = launchCommandDraft.value.trim()
  if (!launchCommand) {
    throw new Error('请填写启动命令')
  }
  if (!force && launchCommand === settings.launchCommand) {
    return
  }
  await settings.save({ launchCommand })
}

onMounted(async () => {
  launchCommandDraft.value = settings.launchCommand
  await processStore.init()
  await scrollToBottom()
})

onUnmounted(() => {
  processStore.dispose()
})

async function onSave(): Promise<void> {
  saving.value = true
  try {
    await persistLaunchCommand(true)
    toast.ok('已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    saving.value = false
  }
}

async function onStart(): Promise<void> {
  try {
    await persistLaunchCommand()
    await processStore.start()
    toast.ok('ComfyUI 已启动')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onStop(): Promise<void> {
  try {
    await processStore.stop()
    toast.info('已停止 ComfyUI')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onClear(): Promise<void> {
  await processStore.clearLogs()
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="page-shell">
    <section class="detail-panel console-panel">
      <div class="panel-header">
        <div class="panel-title-row">
          <div class="panel-title">服务</div>
          <span class="status-pill" :class="{ running: processStore.running }">
            <span v-if="processStore.running" class="spinner" />
            <template v-if="processStore.running">运行中 · pid {{ processStore.pid ?? '-' }}</template>
            <template v-else>未运行</template>
          </span>
        </div>
        <div class="form-actions">
          <button
            type="button"
            class="btn btn-icon"
            :class="processStore.running ? 'btn-danger btn-icon--running' : 'btn-primary'"
            :title="processStore.running ? '运行中，点击停止' : '启动'"
            :aria-label="processStore.running ? '运行中，点击停止' : '启动'"
            :disabled="processStore.busy"
            @click="processStore.running ? onStop() : onStart()"
          >
            <svg
              v-if="processStore.running"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <div class="panel-body console-body">
        <div class="console-meta console-config">
          <div class="field" style="margin-bottom: 0">
            <label class="field-label">启动命令</label>
            <div class="path-row">
              <input
                v-model="launchCommandDraft"
                class="input console-cmd-input"
                type="text"
                spellcheck="false"
              />
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title="保存"
                aria-label="保存启动命令"
                :disabled="saving"
                @click="onSave"
              >
                <IconSave />
              </button>
            </div>
          </div>
        </div>

        <div class="console-log-wrap">
          <button
            type="button"
            class="console-log-clear"
            title="清空日志"
            aria-label="清空日志"
            @click="onClear"
          >
            <IconShredder />
          </button>
          <div ref="logEl" class="console-log">
            <div v-if="!processStore.logs.length" class="empty-state">
              <div class="title">暂无日志</div>
              <div class="hint">点击启动运行 ComfyUI</div>
            </div>
            <div
              v-for="line in processStore.logs"
              :key="line.id"
              class="console-line"
              :class="line.level"
            >
              <span class="console-time">{{ formatTime(line.ts) }}</span>
              <span class="console-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
