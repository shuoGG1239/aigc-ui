<script setup lang="ts">
import { ref } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import { useToast } from '@/composables/useToast'
import { useTxt2ImgStore } from '@/stores/txt2img'
import {
  CLIP_TYPE_OPTIONS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
  WEIGHT_DTYPE_OPTIONS,
} from '@/utils/select-options'

const store = useTxt2ImgStore()
const toast = useToast()
const advancedOpen = ref(false)

async function onGenerate(): Promise<void> {
  try {
    const count = await store.generate()
    toast.ok(count > 1 ? `生成完成 ${count} 张` : `生成完成 (seed=${store.lastSeed})`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onCancel(): Promise<void> {
  await store.cancel()
  toast.info('已请求取消')
}

function onBatchWheel(e: WheelEvent): void {
  const delta = e.deltaY < 0 ? 1 : -1
  store.form.batchSize = Math.min(64, Math.max(1, Number(store.form.batchSize || 1) + delta))
}
</script>

<template>
  <div class="page-shell">
    <SplitPane storage-key="aigc-ui:txt2img-split-v2" :default-width="624" :min-width="360" :max-width="960">
      <template #left>
      <section class="list-panel">
        <div class="panel-header">
          <div class="panel-title">参数</div>
          <div class="form-actions" style="padding-top: 0">
            <button
              type="button"
              class="btn btn-icon"
              :class="store.status === 'running' ? 'btn-danger' : 'btn-primary'"
              :title="store.status === 'running' ? '停止' : '生成'"
              :aria-label="store.status === 'running' ? '停止' : '生成'"
              @click="store.status === 'running' ? onCancel() : onGenerate()"
            >
              <svg
                v-if="store.status === 'running'"
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
        <div class="panel-body">
          <div class="field">
            <label class="field-label">Prompt</label>
            <textarea v-model="store.form.prompt" class="textarea" rows="5" />
          </div>
          <div class="field">
            <label class="field-label">Negative Prompt</label>
            <textarea v-model="store.form.negativePrompt" class="textarea textarea--sm" rows="2" />
          </div>

          <div class="field-row field-row--3">
            <div class="field">
              <label class="field-label">Width</label>
              <input v-model.number="store.form.width" class="input" type="number" min="64" step="64" />
            </div>
            <div class="field">
              <label class="field-label">Height</label>
              <input v-model.number="store.form.height" class="input" type="number" min="64" step="64" />
            </div>
            <div class="field">
              <label class="field-label">Batch</label>
              <input
                v-model.number="store.form.batchSize"
                class="input"
                type="number"
                min="1"
                max="64"
                @wheel.prevent="onBatchWheel"
              />
            </div>
          </div>

          <div class="field-row field-row--4">
            <div class="field">
              <label class="field-label">Steps</label>
              <input v-model.number="store.form.steps" class="input" type="number" min="1" max="150" />
            </div>
            <div class="field">
              <label class="field-label">CFG</label>
              <input v-model.number="store.form.cfg" class="input" type="number" min="0" step="0.1" />
            </div>
            <div class="field">
              <label class="field-label">Denoise</label>
              <input v-model.number="store.form.denoise" class="input" type="number" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label class="field-label">Seed</label>
              <input v-model="store.form.seed" class="input" type="text" placeholder="随机" />
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label">Sampler</label>
              <AppSelect v-model="store.form.sampler" :options="SAMPLER_OPTIONS" />
            </div>
            <div class="field">
              <label class="field-label">Scheduler</label>
              <AppSelect v-model="store.form.scheduler" :options="SCHEDULER_OPTIONS" />
            </div>
          </div>

          <div class="advanced-block">
            <button
              type="button"
              class="advanced-toggle"
              :class="{ open: advancedOpen }"
              @click="advancedOpen = !advancedOpen"
            >
              <span class="chevron">▾</span>
              高级 · 模型预设
            </button>

            <div v-if="advancedOpen">
              <div class="field-row field-row--3">
                <div class="field">
                  <label class="field-label">UNET</label>
                  <input v-model="store.form.unetModel" class="input" type="text" />
                </div>
                <div class="field">
                  <label class="field-label">CLIP</label>
                  <input v-model="store.form.clipModel" class="input" type="text" />
                </div>
                <div class="field">
                  <label class="field-label">VAE</label>
                  <input v-model="store.form.vaeModel" class="input" type="text" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">CLIP Type</label>
                  <AppSelect v-model="store.form.clipType" :options="CLIP_TYPE_OPTIONS" />
                </div>
                <div class="field">
                  <label class="field-label">Weight Dtype</label>
                  <AppSelect v-model="store.form.unetWeightDtype" :options="WEIGHT_DTYPE_OPTIONS" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">AuraFlow Shift</label>
                  <input v-model.number="store.form.auraflowShift" class="input" type="number" step="0.1" />
                </div>
                <div class="field">
                  <label class="field-label">Output Prefix</label>
                  <input v-model="store.form.outputPrefix" class="input" type="text" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
      </template>

      <template #right>
      <section class="detail-panel">
        <div class="panel-header">
          <div class="panel-title">预览</div>
          <button
            v-if="store.results.length"
            type="button"
            class="btn btn-ghost btn-sm"
            @click="store.clearResults()"
          >
            清空
          </button>
        </div>
        <div class="panel-body">
          <div class="preview-area">
            <div class="preview-main">
              <img
                v-if="store.selectedImage"
                :src="store.selectedImage.dataUrl"
                :alt="store.selectedImage.filename"
              />
              <div v-else class="empty-state">
                <div class="title">尚未生成</div>
                <div class="hint">填写提示词后点击「生成」</div>
              </div>
            </div>

            <div v-if="store.selectedImage" class="result-meta">
              {{ store.selectedImage.path }}
              <template v-if="store.lastSeed !== null"> · seed={{ store.lastSeed }}</template>
            </div>

            <div v-if="store.results.length" class="result-list">
              <button
                v-for="(img, i) in store.results"
                :key="img.path + i"
                type="button"
                class="result-thumb"
                :class="{ active: i === store.selectedIndex }"
                @click="store.selectImage(i)"
              >
                <img :src="img.dataUrl" :alt="img.filename" />
              </button>
            </div>
          </div>
        </div>
      </section>
      </template>
    </SplitPane>
  </div>
</template>
