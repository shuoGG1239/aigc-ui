<script setup lang="ts">
import { ref, watch } from 'vue'
import { IconFolderPick, IconSave } from '@/components/icons'
import { useToast } from '@/composables/useToast'
import { DEFAULT_SERVER_URL } from '@shared/app-defaults'
import { clampParamHistoryMax, PARAM_HISTORY_MAX_DEFAULT } from '@shared/limits'
import { useSettingsStore } from '@/stores/settings'
import { useTxt2ImgStore } from '@/stores/txt2img'
import {
  applyPreviewPathMoves,
  collectParamHistoryPreviewPaths,
} from '@/utils/param-history'

const settings = useSettingsStore()
const txt2img = useTxt2ImgStore()
const toast = useToast()
const serverUrlDraft = ref(settings.serverUrl)
const outputDirDraft = ref(settings.outputDir)
const previewDirDraft = ref(settings.promptPreviewDir)
const paramHistoryMaxDraft = ref(String(settings.paramHistoryMax))
const savingUrl = ref(false)
const savingOutputDir = ref(false)
const savingPreviewDir = ref(false)
const savingHistoryMax = ref(false)
const repairingHistory = ref(false)
/** Single scan root for preview-path repair (defaults to output dir). */
const repairRoot = ref(settings.outputDir || '')

watch(
  () => settings.serverUrl,
  (url) => {
    serverUrlDraft.value = url
  },
)

watch(
  () => settings.outputDir,
  (dir) => {
    outputDirDraft.value = dir
    if (!repairRoot.value.trim() && dir) repairRoot.value = dir
  },
)

watch(
  () => settings.promptPreviewDir,
  (dir) => {
    previewDirDraft.value = dir
  },
)

watch(
  () => settings.paramHistoryMax,
  (n) => {
    paramHistoryMaxDraft.value = String(n)
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

async function onSaveOutputDir(): Promise<void> {
  savingOutputDir.value = true
  try {
    const outputDir = outputDirDraft.value.trim()
    if (!outputDir) {
      throw new Error('请填写输出目录')
    }
    await settings.save({ outputDir })
    outputDirDraft.value = settings.outputDir
    toast.ok('输出目录已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    savingOutputDir.value = false
  }
}

async function onSavePreviewDir(): Promise<void> {
  savingPreviewDir.value = true
  try {
    const promptPreviewDir = previewDirDraft.value.trim()
    await settings.save({ promptPreviewDir })
    previewDirDraft.value = settings.promptPreviewDir
    toast.ok(promptPreviewDir ? '预览图目录已保存' : '已清空预览图目录')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    savingPreviewDir.value = false
  }
}

async function onSaveParamHistoryMax(): Promise<void> {
  savingHistoryMax.value = true
  try {
    const paramHistoryMax = clampParamHistoryMax(
      paramHistoryMaxDraft.value,
      PARAM_HISTORY_MAX_DEFAULT,
    )
    paramHistoryMaxDraft.value = String(paramHistoryMax)
    await settings.save({ paramHistoryMax })
    txt2img.applyParamHistoryMax(paramHistoryMax)
    toast.ok('参数历史上限已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    savingHistoryMax.value = false
  }
}

async function onPickRepairRoot(): Promise<void> {
  try {
    const dir = await window.api.shell.pickDir({
      title: '选择参数历史修复扫描目录',
      defaultPath: repairRoot.value || settings.outputDir || undefined,
    })
    if (dir) repairRoot.value = dir
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

async function onRepairParamHistoryPreviews(): Promise<void> {
  repairingHistory.value = true
  try {
    const root = (repairRoot.value || settings.outputDir || '').trim()
    if (!root) {
      throw new Error('请选择扫描目录')
    }
    repairRoot.value = root
    const paths = collectParamHistoryPreviewPaths(txt2img.paramHistory)
    if (!paths.length) {
      toast.info('参数历史中没有预览图路径')
      return
    }
    const { moved, missing, indexed } = await window.api.image.resolveMovedPaths([root], paths)
    const movedCount = Object.keys(moved).length
    if (!movedCount) {
      if (missing.length) {
        toast.info(`未修复：索引 ${indexed} 张，仍缺失 ${missing.length} 条`)
      } else {
        toast.ok(`无需修复（索引 ${indexed} 张，路径均有效）`)
      }
      return
    }
    const { entries, fixed } = applyPreviewPathMoves(txt2img.paramHistory, moved)
    txt2img.replaceParamHistory(entries)
    const missPart = missing.length ? `，仍缺失 ${missing.length}` : ''
    toast.ok(`已修复 ${fixed} 条路径（索引 ${indexed} 张${missPart}）`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    repairingHistory.value = false
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
            :placeholder="DEFAULT_SERVER_URL"
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
            <IconSave />
          </button>
        </div>
      </div>
    </section>

    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div class="panel-title" title="生成结果自动保存到此目录">输出目录</div>
        <div class="path-row settings-path">
          <input
            v-model="outputDirDraft"
            class="input"
            type="text"
            spellcheck="false"
            title="生成结果自动保存到此目录"
            @keydown.enter="onSaveOutputDir"
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
            <IconFolderPick />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="保存"
            aria-label="保存输出目录"
            :disabled="savingOutputDir"
            @click="onSaveOutputDir"
          >
            <IconSave />
          </button>
        </div>
      </div>
    </section>

    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div class="panel-title" title="非收藏参数历史最多保留条数；收藏不计入">
          参数历史上限
        </div>
        <div class="path-row settings-path">
          <input
            v-model="paramHistoryMaxDraft"
            class="input"
            type="number"
            min="0"
            step="1"
            :placeholder="String(PARAM_HISTORY_MAX_DEFAULT)"
            title="非收藏参数历史最多保留条数；收藏不计入"
            @keydown.enter="onSaveParamHistoryMax"
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon settings-save-end"
            title="保存"
            aria-label="保存参数历史上限"
            :disabled="savingHistoryMax"
            @click="onSaveParamHistoryMax"
          >
            <IconSave />
          </button>
        </div>
      </div>
    </section>

    <section class="detail-panel settings-panel">
      <div class="panel-header settings-header">
        <div
          class="panel-title"
          title="在选定目录中按文件名找回已移动的产出图，并写回参数历史预览路径；多目录可分次扫描"
        >
          参数历史修复
        </div>
        <div class="path-row settings-path">
          <input
            v-model="repairRoot"
            class="input"
            type="text"
            spellcheck="false"
            placeholder="扫描目录（默认可填输出目录）"
            title="扫描目录；可手动输入或选择"
            @keydown.enter="onRepairParamHistoryPreviews"
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="选择扫描目录"
            aria-label="选择扫描目录"
            @click="onPickRepairRoot"
          >
            <IconFolderPick />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon settings-save-end"
            title="开始修复"
            aria-label="开始修复参数历史预览路径"
            :disabled="repairingHistory"
            @click="onRepairParamHistoryPreviews"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
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
            v-model="previewDirDraft"
            class="input"
            type="text"
            spellcheck="false"
            placeholder="未配置"
            title="提示词预览图目录"
            @keydown.enter="onSavePreviewDir"
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
            <IconFolderPick />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title="保存"
            aria-label="保存预览图目录"
            :disabled="savingPreviewDir"
            @click="onSavePreviewDir"
          >
            <IconSave />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
