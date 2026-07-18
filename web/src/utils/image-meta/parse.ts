import { parseA1111FieldMap, parseA1111ParametersText } from './a1111'
import { parseComfyUiMeta } from './comfyui'
import { asRecord, emptyMeta, firstString } from './helpers'
import { parseNovelAiMeta } from './novelai'
import type { ImageMeta, ImageMetaParseResult } from './types'

/**
 * Parse PNG metadata / clipboard JSON into a unified ImageMeta.
 * Tries ComfyUI → NovelAI → A1111 fields → A1111 parameters text.
 */
export function parseImageMeta(input: unknown): ImageMetaParseResult {
  const raw = normalizeRaw(input)
  const meta =
    parseComfyUiMeta(raw) ||
    parseNovelAiMeta(raw) ||
    parseA1111FieldMap(raw) ||
    parseParametersChunk(raw) ||
    emptyMeta('unknown')

  return { meta, raw }
}

function normalizeRaw(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    const text = input.trim()
    if (!text) return {}
    try {
      const parsed = JSON.parse(text)
      const rec = asRecord(parsed)
      if (rec) return rec
    } catch {
      // plain a1111 parameters text
      return { parameters: text }
    }
    return { parameters: text }
  }

  const rec = asRecord(input)
  return rec ?? {}
}

function parseParametersChunk(raw: Record<string, unknown>): ImageMeta | null {
  if (typeof raw.parameters === 'string') {
    return parseA1111ParametersText(raw.parameters)
  }
  const info = firstString(raw.infotexts)
  if (info) return parseA1111ParametersText(info)
  return null
}
