import { basename, extname } from 'path'
import { existsSync } from 'fs'
import { ComfyUIClient } from './comfyui'
import { getSettings } from './settings'
import { buildWd14Workflow, extractWd14Tags } from '@shared/wd14-workflow'
import type { Wd14TagParams, Wd14TagResult } from '@shared/ipc-types'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])

export async function runWd14Tag(params: Wd14TagParams): Promise<Wd14TagResult> {
  const imagePath = params.imagePath?.trim()
  if (!imagePath) throw new Error('图片路径为空')
  if (!existsSync(imagePath)) throw new Error('图片不存在')
  const ext = extname(imagePath).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) {
    throw new Error(`不支持的图片格式: ${ext || '(无扩展名)'}`)
  }

  const settings = getSettings()
  const client = new ComfyUIClient(settings.serverUrl)
  const health = await client.healthCheck()
  if (!health.ok) throw new Error(health.message)

  const uploaded = await client.uploadImage(imagePath)
  const imageName = uploaded.subfolder
    ? `${uploaded.subfolder}/${uploaded.name}`.replace(/\\/g, '/')
    : uploaded.name

  const model = params.model?.trim() || 'wd-swinv2-tagger-v3'
  const workflow = buildWd14Workflow(imageName, {
    model,
    threshold: clamp01(params.threshold, 0.35),
    characterThreshold: clamp01(params.characterThreshold, 0.85),
    replaceUnderscore: params.replaceUnderscore !== false,
    trailingComma: params.trailingComma === true,
    excludeTags: params.excludeTags ?? '',
  })

  const promptId = await client.queuePrompt(workflow)
  const entry = await client.waitForCompletion(promptId, 1_000, 600_000)
  const tags = extractWd14Tags(entry)

  return {
    promptId,
    tags,
    model,
    imagePath,
    filename: basename(imagePath),
  }
}

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}
