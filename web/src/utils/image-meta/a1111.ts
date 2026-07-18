import {
  emptyMeta,
  firstString,
  guessFamily,
  normalizeSamplerName,
  num,
  str,
} from './helpers'
import type { ImageMeta } from './types'

/** A1111 / Forge “parameters” tEXt blob. */
export function parseA1111ParametersText(text: string): ImageMeta | null {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return null

  const stepsIdx = raw.search(/\nSteps:\s*/i)
  if (stepsIdx < 0 && !/^Steps:\s*/i.test(raw)) return null

  let prompt = ''
  let negative = ''
  let paramsLine = ''

  if (stepsIdx >= 0) {
    const head = raw.slice(0, stepsIdx)
    paramsLine = raw.slice(stepsIdx).replace(/^\nSteps:\s*/i, 'Steps: ')
    const negMatch = head.match(/^(.*?)\nNegative prompt:\s*([\s\S]*)$/i)
    if (negMatch) {
      prompt = negMatch[1].trim()
      negative = negMatch[2].trim()
    } else {
      prompt = head.trim()
    }
  } else {
    paramsLine = raw
  }

  const meta = emptyMeta('a1111')
  meta.prompt = prompt
  meta.negativePrompt = negative

  const steps = pickParam(paramsLine, /Steps:\s*([\d.]+)/i)
  const sampler = pickParam(paramsLine, /Sampler:\s*([^,\n]+)/i)
  const schedule = pickParam(paramsLine, /Schedule type:\s*([^,\n]+)/i)
  const cfg = pickParam(paramsLine, /CFG scale:\s*([\d.]+)/i)
  const seed = pickParam(paramsLine, /Seed:\s*([-\d]+)/i)
  const size = pickParam(paramsLine, /Size:\s*(\d+)x(\d+)/i)
  const model = pickParam(paramsLine, /Model:\s*([^,\n]+)/i)

  if (steps) meta.steps = Math.round(Number(steps[1]))
  if (sampler) meta.sampler = normalizeSamplerName(sampler[1].trim())
  if (schedule) meta.scheduler = schedule[1].trim()
  if (cfg) meta.cfg = Number(cfg[1])
  if (seed) meta.seed = seed[1].trim()
  if (size) {
    meta.width = Number(size[1])
    meta.height = Number(size[2])
  }
  if (model) meta.model = model[1].trim()
  meta.family = guessFamily({
    model: meta.model,
    width: meta.width,
    height: meta.height,
    source: 'a1111',
  })

  return meta.prompt || meta.steps != null ? meta : null
}

/** A1111 PNG info stored as discrete text chunks (prompt / negative_prompt / …). */
export function parseA1111FieldMap(raw: Record<string, unknown>): ImageMeta | null {
  const prompt = firstString(raw.prompt)
  const hasDiscrete =
    typeof raw.steps !== 'undefined' ||
    typeof raw.cfg_scale !== 'undefined' ||
    typeof raw.sampler_name !== 'undefined' ||
    typeof raw.sd_model_name !== 'undefined'
  if (!prompt && !hasDiscrete) return null
  if (!hasDiscrete && !raw.negative_prompt && !raw.infotexts) return null

  // Prefer structured fields; fall back to infotexts blob.
  if (!prompt && Array.isArray(raw.infotexts) && typeof raw.infotexts[0] === 'string') {
    return parseA1111ParametersText(raw.infotexts[0])
  }

  const meta = emptyMeta('a1111')
  meta.prompt = prompt
  meta.negativePrompt = firstString(raw.negative_prompt)
  meta.steps = intOrNull(raw.steps)
  meta.cfg = num(raw.cfg_scale)
  meta.sampler = normalizeSamplerName(str(raw.sampler_name))
  meta.seed = str(raw.seed)
  meta.width = intOrNull(raw.width)
  meta.height = intOrNull(raw.height)
  meta.model = str(raw.sd_model_name)
  meta.scheduler = ''
  meta.family = guessFamily({
    model: meta.model,
    width: meta.width,
    height: meta.height,
    source: 'a1111',
  })

  // If discrete fields lack prompt but infotexts exists, merge prompt/neg from it.
  if ((!meta.prompt || !meta.negativePrompt) && Array.isArray(raw.infotexts)) {
    const fromText = parseA1111ParametersText(firstString(raw.infotexts))
    if (fromText) {
      if (!meta.prompt) meta.prompt = fromText.prompt
      if (!meta.negativePrompt) meta.negativePrompt = fromText.negativePrompt
      if (meta.steps == null) meta.steps = fromText.steps
      if (meta.cfg == null) meta.cfg = fromText.cfg
      if (!meta.sampler) meta.sampler = fromText.sampler
      if (!meta.seed) meta.seed = fromText.seed
      if (meta.width == null) meta.width = fromText.width
      if (meta.height == null) meta.height = fromText.height
      if (!meta.model) meta.model = fromText.model
    }
  }

  return meta.prompt || meta.steps != null ? meta : null
}

function pickParam(line: string, re: RegExp): RegExpMatchArray | null {
  return line.match(re)
}

function intOrNull(value: unknown): number | null {
  const n = num(value)
  return n == null ? null : Math.round(n)
}
