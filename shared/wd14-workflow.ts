import { ComfyClass } from './comfy-class'
import type { Wd14TagParams } from './ipc-types'

export function buildWd14Workflow(
  imageName: string,
  params: Pick<
    Wd14TagParams,
    | 'model'
    | 'threshold'
    | 'characterThreshold'
    | 'replaceUnderscore'
    | 'trailingComma'
    | 'excludeTags'
  >,
): Record<string, unknown> {
  return {
    '1': {
      class_type: ComfyClass.LoadImage,
      inputs: {
        image: imageName,
      },
    },
    '2': {
      class_type: ComfyClass.WD14Tagger,
      inputs: {
        image: ['1', 0],
        model: params.model,
        threshold: params.threshold,
        character_threshold: params.characterThreshold,
        replace_underscore: params.replaceUnderscore,
        trailing_comma: params.trailingComma,
        exclude_tags: params.excludeTags,
      },
    },
  }
}

/** Pull STRING / tags from a history entry (WD14 OUTPUT_NODE shapes vary). */
export function extractWd14Tags(historyEntry: Record<string, unknown>): string {
  const outputs = (historyEntry.outputs ?? {}) as Record<string, Record<string, unknown>>
  for (const nodeOut of Object.values(outputs)) {
    for (const key of ['tags', 'text', 'string', 'STRING']) {
      const v = nodeOut[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (Array.isArray(v)) {
        const first = v.find((x) => typeof x === 'string' && String(x).trim())
        if (typeof first === 'string') return first.trim()
      }
    }
  }

  const raw = JSON.stringify(historyEntry)
  const m = /"tags"\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/.exec(raw)
  if (m?.[1]) {
    return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
  }

  throw new Error('WD14 反推完成但未找到标签输出，请确认已安装 ComfyUI-WD14-Tagger 并重启 ComfyUI')
}
