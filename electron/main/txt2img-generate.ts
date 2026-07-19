import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import { ComfyUIClient } from './comfyui'
import { defaultOutputDir, getSettings } from './settings'
import { buildWorkflow } from './workflow/index'
import { extractLoraTags, resolveLoras } from './workflow/lora'
import { clampBatchSize } from '@shared/limits'
import type { GenerateProgress, GenerateResult, ResolvedLora, Txt2ImgParams } from './types'

export type ActiveClientHolder = {
  client: ComfyUIClient | null
}

function sendProgress(event: IpcMainInvokeEvent, payload: GenerateProgress): void {
  event.sender.send('txt2img:progress', payload)
}

export async function generateTxt2Img(
  event: IpcMainInvokeEvent,
  params: Txt2ImgParams,
  holder: ActiveClientHolder,
): Promise<GenerateResult> {
  const settings = getSettings()
  const client = new ComfyUIClient(settings.serverUrl)
  holder.client = client
  client.resetCancel()

  try {
    const health = await client.healthCheck()
    if (!health.ok) {
      throw new Error(health.message)
    }

    const count = clampBatchSize(params.batchSize)
    const outputDir = settings.outputDir || defaultOutputDir()
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const ts = Math.floor(Date.now() / 1000)
    const prefix = params.outputPrefix || (params.family === 'sdxl' ? 'sdxl' : 'anima')
    const images: GenerateResult['images'] = []
    const seeds: number[] = []
    let lastPromptId = ''
    let availableLoras: string[] | null = null
    let batchIndex = 0

    await client.openProgress((evt) => {
      const phase: GenerateProgress['phase'] =
        evt.kind === 'executing' && evt.node === null ? 'done' : 'running'
      sendProgress(event, {
        index: batchIndex,
        total: count,
        promptId: evt.promptId,
        value: evt.value,
        max: evt.max,
        node: evt.node,
        phase,
      })
    })

    for (let i = 0; i < count; i++) {
      batchIndex = i
      const seedForRun =
        params.seed !== null && params.seed !== undefined
          ? params.seed + i
          : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

      const promptForRun =
        Array.isArray(params.prompts) && params.prompts[i] !== undefined
          ? params.prompts[i]
          : params.prompt
      const negativeForRun =
        Array.isArray(params.negativePrompts) && params.negativePrompts[i] !== undefined
          ? params.negativePrompts[i]
          : params.negativePrompt
      const extracted = extractLoraTags(promptForRun, negativeForRun)
      let loras: ResolvedLora[] = []
      if (extracted.loras.length) {
        if (!availableLoras) {
          availableLoras = await client.listModels('loras')
        }
        loras = resolveLoras(extracted.loras, availableLoras)
      }
      const { workflow, seed } = buildWorkflow(
        {
          ...params,
          prompt: extracted.prompt,
          negativePrompt: extracted.negativePrompt,
          loras,
        },
        seedForRun,
      )

      sendProgress(event, {
        index: i,
        total: count,
        promptId: '',
        value: 0,
        max: 0,
        node: null,
        phase: 'queued',
      })

      const promptId = await client.queuePrompt(workflow)
      lastPromptId = promptId
      sendProgress(event, {
        index: i,
        total: count,
        promptId,
        value: 0,
        max: 0,
        node: null,
        phase: 'running',
      })

      const historyEntry = await client.waitForCompletion(promptId)
      const remoteImages = client.extractOutputImages(historyEntry)

      if (!remoteImages.length) {
        throw new Error(`第 ${i + 1}/${count} 张生成完成但未找到输出图片，请检查 ComfyUI 日志。`)
      }

      const img = remoteImages[0]
      const data = await client.downloadImage(img.filename, img.subfolder, img.type)
      const suffix = extname(img.filename) || '.png'
      const filename = `${ts}_${i}_${prefix}${suffix}`
      const path = join(outputDir, filename)
      writeFileSync(path, data)

      const mime =
        suffix.toLowerCase() === '.jpg' || suffix.toLowerCase() === '.jpeg' ? 'image/jpeg' : 'image/png'
      const image = {
        path,
        filename,
        dataUrl: `data:${mime};base64,${data.toString('base64')}`,
      }
      images.push(image)
      seeds.push(seed)

      sendProgress(event, {
        index: i,
        total: count,
        promptId,
        value: 1,
        max: 1,
        node: null,
        phase: 'done',
      })

      event.sender.send('txt2img:image', {
        image,
        seed,
        index: i,
        total: count,
        promptId,
      })
    }

    return { promptId: lastPromptId, seed: seeds[0], seeds, images }
  } finally {
    client.closeProgress()
    holder.client = null
  }
}
