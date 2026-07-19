import { getFamilyDefaults, type ModelFamily } from '@/models/family'
import { imageMetaToForm, parseImageMeta } from '@/utils/image-meta'
import { parseComfyUiToForm } from '@/utils/image-meta/comfyui'
import { asRecord, normalizeSchedulerName } from '@/utils/image-meta/helpers'
import type { Txt2ImgForm } from '@/stores/txt2img'

export interface ParseWorkflowParamsOptions {
  /** For A1111 / NovelAI: keep current UI family. ComfyUI graph still wins. */
  preferFamily?: ModelFamily | null
  /** Merge A1111 / NovelAI fields onto the current form. */
  base?: Txt2ImgForm | null
}

/**
 * Parse ComfyUI / A1111 / NovelAI PNG metadata (or JSON text) into form fields.
 * Prefer full Comfy graph mapping when present.
 */
export function parseWorkflowParams(
  text: string,
  opts: ParseWorkflowParamsOptions = {},
): Txt2ImgForm {
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // plain parameters text handled by parseImageMeta
  }

  const raw = typeof data === 'string' ? { parameters: data } : asRecord(data) || {}
  const comfy = parseComfyUiToForm(raw)
  const form =
    comfy ??
    (() => {
      const { meta } = parseImageMeta(raw)
      if (meta.source === 'unknown' && !meta.prompt.trim()) {
        throw new Error('未找到可识别的生成参数')
      }
      return imageMetaToForm(meta, {
        preferFamily: opts.preferFamily ?? opts.base?.family,
        base: opts.base,
      })
    })()

  // 剪贴板 / 图片应用：A1111 的 Automatic 等需映射为 ComfyUI 合法 scheduler
  form.scheduler = normalizeSchedulerName(
    form.scheduler,
    getFamilyDefaults(form.family).scheduler,
  )
  return form
}
