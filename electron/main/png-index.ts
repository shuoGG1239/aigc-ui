import { basename, extname, join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export interface BasenameIndexHit {
  path: string
  mtime: number
}

/** Recursively index image files under `roots` by basename (newer mtime wins on clash). */
export function indexImagesByBasename(roots: string[]): Map<string, BasenameIndexHit> {
  const index = new Map<string, BasenameIndexHit>()
  const seenDirs = new Set<string>()

  const stack = roots
    .map((r) => r?.trim())
    .filter((r): r is string => !!r && existsSync(r))

  while (stack.length) {
    const dir = stack.pop()!
    let real = dir
    try {
      real = statSync(dir).isDirectory() ? dir : ''
    } catch {
      continue
    }
    if (!real || seenDirs.has(real)) continue
    seenDirs.add(real)

    let names: string[]
    try {
      names = readdirSync(real)
    } catch {
      continue
    }

    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = join(real, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!st.isFile()) continue
      const ext = extname(name).toLowerCase()
      if (!IMAGE_EXT.has(ext)) continue
      const prev = index.get(name)
      if (!prev || st.mtimeMs >= prev.mtime) {
        index.set(name, { path: full, mtime: st.mtimeMs })
      }
    }
  }

  return index
}

export interface ResolveMovedPathsResult {
  /** old absolute path → new absolute path (only changed entries) */
  moved: Record<string, string>
  /** paths that are missing and not found by basename */
  missing: string[]
  /** number of image files indexed */
  indexed: number
}

/**
 * For each path: keep if file still exists; else remap via basename index.
 */
export function resolveMovedImagePaths(
  roots: string[],
  paths: string[],
): ResolveMovedPathsResult {
  const index = indexImagesByBasename(roots)
  const moved: Record<string, string> = {}
  const missing: string[] = []
  const seenMissing = new Set<string>()

  for (const raw of paths) {
    const p = raw?.trim()
    if (!p) continue
    if (existsSync(p)) continue
    const name = basename(p)
    const hit = index.get(name)
    if (hit) {
      if (hit.path !== p) moved[p] = hit.path
    } else if (!seenMissing.has(p)) {
      seenMissing.add(p)
      missing.push(p)
    }
  }

  return { moved, missing, indexed: index.size }
}
