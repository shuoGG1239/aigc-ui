import type { ModelFamily } from '../models/family'

/** Shared quality / negative presets for family defaults and `<pool:quality|neg>`. */
export interface PromptPresetContext {
  family: ModelFamily
  checkpoint?: string
  unetModel?: string
}

function modelHint(ctx: PromptPresetContext): string {
  return `${ctx.checkpoint || ''} ${ctx.unetModel || ''}`.toLowerCase()
}

export function looksLikePony(ctx: PromptPresetContext): boolean {
  return /pony|autismmix|audiobell/.test(modelHint(ctx))
}

export function presetQualityPrompt(ctx: PromptPresetContext): string {
  if (ctx.family === 'anima') {
    return 'masterpiece, best quality, score_9'
  }
  if (looksLikePony(ctx)) {
    return 'score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up'
  }
  return 'very awa, masterpiece, best quality, newest, highres, absurdres'
}

export function presetNegativePrompt(ctx: PromptPresetContext): string {
  if (ctx.family === 'anima') {
    return (
      'worst quality, low quality, score_1, score_2, score_3, ' +
      'artist name, blurry, jpeg artifacts, chromatic aberration'
    )
  }
  if (looksLikePony(ctx)) {
    return 'score_6, score_5, score_4, worst quality, low quality, bad anatomy, bad hands, text, watermark'
  }
  return (
    'worst quality, old, early, low quality, lowres, signature, username, logo, ' +
    'bad hands, mutated hands, mammal, anthro, furry, ambiguous form, feral, semi-anthro'
  )
}
