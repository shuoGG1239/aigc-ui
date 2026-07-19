import { loraFileStem } from '@shared/lora-tag'

let cache: string[] | null = null
let loadPromise: Promise<string[]> | null = null
let loadedAt = 0
const TTL_MS = 60_000

export function invalidateLoraCache(): void {
  cache = null
  loadPromise = null
  loadedAt = 0
}

export async function ensureLoraList(): Promise<string[]> {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache
  if (!loadPromise) {
    loadPromise = window.api.comfy
      .listModels('loras')
      .then((names) => {
        cache = names
        loadedAt = Date.now()
        return names
      })
      .catch((err) => {
        loadPromise = null
        throw err
      })
  }
  return loadPromise
}

export interface LoraHit {
  fileName: string
  stem: string
}

export function searchLoras(files: string[], query: string, limit = 25): LoraHit[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_')
  const hits: LoraHit[] = []
  for (const fileName of files) {
    const stem = loraFileStem(fileName)
    const stemLower = stem.toLowerCase()
    const fileLower = fileName.toLowerCase()
    if (!q || stemLower.includes(q) || fileLower.includes(q)) {
      hits.push({ fileName, stem })
    }
  }
  hits.sort((a, b) => {
    if (!q) return a.stem.localeCompare(b.stem)
    const ap = a.stem.toLowerCase().startsWith(q) ? 0 : 1
    const bp = b.stem.toLowerCase().startsWith(q) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.stem.localeCompare(b.stem)
  })
  return hits.slice(0, limit)
}
