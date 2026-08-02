<script setup lang="ts">
import { computed } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import ImageToolsPreviewPanel from '@/components/image-tools/ImageToolsPreviewPanel.vue'
import { useToast } from '@/composables/useToast'
import { IMAGE_TOOL_OPTIONS, useImageToolsStore } from '@/stores/image-tools'

defineOptions({ name: 'ImageToolsView' })

const store = useImageToolsStore()
const toast = useToast()

const toolModel = computed({
  get: () => store.activeTool,
  set: (v: string) => store.setActiveTool(v),
})

async function onRun(): Promise<void> {
  if (store.running) return
  try {
    await store.runActiveTool()
    if (store.activeTool === 'wd14-tag') toast.ok('反推完成')
    else toast.ok('完成')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onCopyTags(): Promise<void> {
  const text = store.tags.trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.ok('已复制标签')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:image-tools-split" :default-width="420" :min-width="320" :max-ratio="0.55">
      <template #left>
        <section class="list-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <AppSelect
                v-model="toolModel"
                class="image-tool-select"
                variant="plain"
                :options="IMAGE_TOOL_OPTIONS"
                :disabled="store.running"
                placeholder="选择工具"
              />
              <span v-if="store.running" class="status-pill">运行中</span>
            </div>
            <div class="form-actions" style="padding-top: 0">
              <button
                type="button"
                class="btn btn-icon"
                :class="store.running ? 'btn-danger btn-icon--running' : 'btn-primary'"
                :title="store.running ? '运行中' : `运行 ${store.activeToolLabel}`"
                :aria-label="store.running ? '运行中' : `运行 ${store.activeToolLabel}`"
                :disabled="store.running || !store.selectedImage"
                @click="onRun"
              >
                <svg
                  v-if="store.running"
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

          <div class="panel-body image-tools-body">
            <template v-if="store.activeTool === 'wd14-tag'">
              <div class="tool-block">
                <div class="tool-block-desc" title="通过 ComfyUI-WD14-Tagger 节点">
                  模型 {{ store.wd14.model }}
                </div>

                <div class="tool-form">
                  <label class="field">
                    <span class="field-label">General</span>
                    <input
                      v-model.number="store.wd14.threshold"
                      class="input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      :disabled="store.running"
                    />
                  </label>
                  <label class="field">
                    <span class="field-label">Character</span>
                    <input
                      v-model.number="store.wd14.characterThreshold"
                      class="input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      :disabled="store.running"
                    />
                  </label>
                  <label class="field field--check">
                    <span class="field-label">空格</span>
                    <input
                      v-model="store.wd14.replaceUnderscore"
                      type="checkbox"
                      :disabled="store.running"
                      title="将下划线替换为空格"
                    />
                  </label>
                </div>

                <label class="field">
                  <span class="field-label">排除</span>
                  <input
                    v-model="store.wd14.excludeTags"
                    class="input"
                    type="text"
                    placeholder="comma-separated tags to exclude"
                    :disabled="store.running"
                  />
                </label>
              </div>

              <div class="tool-block tool-block--grow">
                <div class="tool-block-header">
                  <div class="tool-block-title">反推结果</div>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title="复制"
                    aria-label="复制"
                    :disabled="!store.tags.trim()"
                    @click="onCopyTags"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect
                        x="5.5"
                        y="5.5"
                        width="7"
                        height="7"
                        rx="1.2"
                        stroke="currentColor"
                        stroke-width="1.4"
                      />
                      <path
                        d="M10.5 5.5V4.2A1.2 1.2 0 0 0 9.3 3H4.2A1.2 1.2 0 0 0 3 4.2v5.1A1.2 1.2 0 0 0 4.2 10.5H5.5"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <textarea
                  class="textarea image-tools-tags"
                  :value="store.tags"
                  readonly
                  placeholder="拖入图片后点击运行"
                  spellcheck="false"
                />
                <div v-if="store.lastModel" class="tool-meta">{{ store.lastModel }}</div>
              </div>
            </template>
          </div>
        </section>
      </template>
      <template #right>
        <ImageToolsPreviewPanel />
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.image-tool-select {
  max-width: min(260px, 52vw);
}

.image-tools-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.tool-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.tool-block--grow {
  flex: 1 1 auto;
  min-height: 0;
}

.tool-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tool-block-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
}

.tool-block-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  font-family: var(--mono);
}

.tool-form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  min-width: 0;
}

.field--check {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
  padding-bottom: 2px;
}

.field--check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
}

.image-tools-tags {
  flex: 1 1 auto;
  min-height: 160px;
  resize: none;
}

.tool-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--mono);
}
</style>
