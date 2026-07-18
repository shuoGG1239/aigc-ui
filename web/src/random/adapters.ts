import type { ModelFamily } from '@/models/family'
import { formatAnimaPrompt, formatSdxlPrompt } from '@/utils/prompt-format'
import {
  canonArtistText,
  parseCanonSegments,
  segmentsToCanon,
  type PromptSegment,
} from './prompt-canon'
import { prettyPrompt } from './prompt-tool'

/** Convert canon prompts for the active family (`@artist` → bare on SDXL). */
export function adaptRandomPrompt(raw: string, family: ModelFamily): string {
  const cleaned = prettyPrompt(raw)
  const segments = parseCanonSegments(cleaned).map((seg) => adaptSegment(seg, family))
  const joined = segmentsToCanon(segments)
  if (family === 'anima') {
    return formatAnimaPrompt(joined)
  }
  return formatSdxlPrompt(joined)
}

function adaptSegment(seg: PromptSegment, family: ModelFamily): PromptSegment {
  let text = canonArtistText(seg.text.trim())
  if (family === 'sdxl' && text.startsWith('@')) {
    text = text.slice(1).trim()
  }
  return { text, strength: seg.strength }
}
