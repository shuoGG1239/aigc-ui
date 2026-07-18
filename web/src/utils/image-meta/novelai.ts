import { asRecord, emptyMeta, guessFamily, normalizeSamplerName, num, str } from './helpers'
import type { ImageMeta } from './types'

/** NovelAI PNG: Software=NovelAI + Comment JSON (prompt / uc / scale / …). */
export function parseNovelAiMeta(raw: Record<string, unknown>): ImageMeta | null {
  const software = str(raw.Software || raw.software).toLowerCase()
  const commentRaw = raw.Comment ?? raw.comment
  const comment =
    typeof commentRaw === 'string'
      ? safeJson(commentRaw)
      : asRecord(commentRaw)

  const looksNai =
    software.includes('novelai') ||
    (comment && (typeof comment.uc === 'string' || comment.request_type != null))
  if (!looksNai && !comment) return null
  if (!comment && !raw.Description) return null

  const meta = emptyMeta('novelai')
  const description = str(raw.Description || raw.description)

  if (comment) {
    meta.prompt = str(comment.prompt) || description
    meta.negativePrompt = str(comment.uc)
    meta.steps = num(comment.steps) != null ? Math.round(Number(comment.steps)) : null
    meta.cfg = num(comment.scale)
    meta.width = num(comment.width) != null ? Math.round(Number(comment.width)) : null
    meta.height = num(comment.height) != null ? Math.round(Number(comment.height)) : null
    meta.seed = str(comment.seed)
    meta.sampler = normalizeSamplerName(str(comment.sampler))
    meta.model = str(raw.Source || raw.source)
  } else {
    meta.prompt = description
  }

  meta.family = guessFamily({
    model: meta.model,
    width: meta.width,
    height: meta.height,
    source: 'novelai',
  })

  return meta.prompt ? meta : null
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text)
    return asRecord(v)
  } catch {
    return null
  }
}
