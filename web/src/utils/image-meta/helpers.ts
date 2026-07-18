import type { ModelFamily } from '@/models/family'
import type { ImageMeta, ImageMetaSource } from './types'

export function emptyMeta(source: ImageMetaSource = 'unknown'): ImageMeta {
  return {
    source,
    prompt: '',
    negativePrompt: '',
    width: null,
    height: null,
    steps: null,
    cfg: null,
    sampler: '',
    scheduler: '',
    seed: '',
    model: '',
    family: null,
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function str(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

export function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function firstString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

/** Map common WebUI / NAI sampler labels toward Comfy-ish names when obvious. */
export function normalizeSamplerName(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const map: Record<string, string> = {
    'euler a': 'euler_ancestral',
    'euler_a': 'euler_ancestral',
    k_euler_a: 'euler_ancestral',
    k_euler_ancestral: 'euler_ancestral',
    k_euler: 'euler',
    euler: 'euler',
    'dpm++_2m': 'dpmpp_2m',
    'dpm++ 2m': 'dpmpp_2m',
    'dpm++ sde': 'dpmpp_sde',
    uni_pc: 'uni_pc',
  }
  return map[s.toLowerCase()] || s
}

export function guessFamily(hints: {
  model?: string
  width?: number | null
  height?: number | null
  source?: ImageMetaSource
}): ModelFamily | null {
  const model = (hints.model || '').toLowerCase()
  if (model.includes('anima') || model.includes('auraflow')) return 'anima'
  if (
    model.includes('xl') ||
    model.includes('sdxl') ||
    model.includes('noobai') ||
    model.includes('pony') ||
    model.includes('illustrious')
  ) {
    return 'sdxl'
  }
  if (hints.source === 'novelai') return 'sdxl'
  const w = hints.width
  const h = hints.height
  if (w && h && (w >= 768 || h >= 768)) return 'sdxl'
  return null
}
