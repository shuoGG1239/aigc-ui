import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import {
  normalizePreviewKey,
  previewKeysFromPrompt,
} from '../../web/src/random/prompt-preview'
import { getSettings } from './settings'

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i

export interface PromptPreviewImage {
  path: string
  dataUrl: string
  filename: string
}

export type PromptPreviewResolveResult =
  | { ok: true; images: PromptPreviewImage[] }
  | { ok: false; reason: 'no_dir' | 'not_found' }

let indexCache: { dir: string; mtimeMs: number; map: Map<string, string[]> } | null = null

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase()
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.png') return 'image/png'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

function buildIndex(dir: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!existsSync(dir)) return map
  for (const name of readdirSync(dir)) {
    if (!IMAGE_RE.test(name)) continue
    const full = join(dir, name)
    try {
      if (!statSync(full).isFile()) continue
    } catch {
      continue
    }
    const stem = basename(name, extname(name))
    const key = normalizePreviewKey(stem)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(full)
    else map.set(key, [full])
  }
  return map
}

function getIndex(dir: string): Map<string, string[]> {
  let mtimeMs = 0
  try {
    mtimeMs = statSync(dir).mtimeMs
  } catch {
    indexCache = null
    return new Map()
  }
  if (indexCache && indexCache.dir === dir && indexCache.mtimeMs === mtimeMs) {
    return indexCache.map
  }
  const map = buildIndex(dir)
  indexCache = { dir, mtimeMs, map }
  return map
}

function toPreviewImage(path: string): PromptPreviewImage | null {
  if (!existsSync(path)) return null
  const ext = extname(path)
  const data = readFileSync(path)
  return {
    path,
    filename: basename(path),
    dataUrl: `data:${mimeForExt(ext)};base64,${data.toString('base64')}`,
  }
}

export function resolvePromptPreview(prompt: string): PromptPreviewResolveResult {
  const dir = getSettings().promptPreviewDir?.trim()
  if (!dir || !existsSync(dir)) {
    return { ok: false, reason: 'no_dir' }
  }

  const index = getIndex(dir)
  if (!index.size) return { ok: false, reason: 'not_found' }

  const paths: string[] = []
  const seen = new Set<string>()
  for (const key of previewKeysFromPrompt(prompt)) {
    const hits = index.get(key)
    if (!hits?.length) continue
    for (const path of hits) {
      if (seen.has(path)) continue
      seen.add(path)
      paths.push(path)
    }
  }

  const images = paths
    .map((p) => toPreviewImage(p))
    .filter((img): img is PromptPreviewImage => !!img)

  if (!images.length) return { ok: false, reason: 'not_found' }
  return { ok: true, images }
}
