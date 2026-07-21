import { clipboard } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import { extractPngInfo } from './png-info'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).compare(PNG_SIG) === 0
}

/** Raw PNG formats that may preserve tEXt / iTXt chunks. */
const RAW_PNG_FORMATS = ['PNG', 'image/png', 'public.png'] as const

/**
 * Read a PNG buffer from the clipboard.
 * Prefer raw PNG bytes or a copied file path (keeps generation metadata).
 * NativeImage fallback re-encodes and usually strips text chunks.
 */
export function readClipboardPngBuffer(): Buffer | null {
  for (const fmt of RAW_PNG_FORMATS) {
    try {
      const buf = Buffer.from(clipboard.readBuffer(fmt))
      if (isPng(buf)) return buf
    } catch {
      // format unavailable
    }
  }

  const filePath = readClipboardPngPath()
  if (filePath) {
    try {
      const buf = readFileSync(filePath)
      if (isPng(buf)) return buf
    } catch {
      // ignore
    }
  }

  try {
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      const buf = Buffer.from(img.toPNG())
      if (isPng(buf)) return buf
    }
  } catch {
    // ignore
  }

  return null
}

/** Explorer “copy file” → FileNameW (Windows) / path text. */
function readClipboardPngPath(): string | null {
  try {
    const buf = clipboard.readBuffer('FileNameW')
    if (buf.length >= 4) {
      const path = buf.toString('utf16le').replace(/\0+$/g, '').trim()
      if (path && extname(path).toLowerCase() === '.png' && existsSync(path)) {
        return path
      }
    }
  } catch {
    // ignore
  }

  try {
    const text = clipboard.readText().trim()
    // Single path, or file:// URI
    const candidate = text.startsWith('file://')
      ? decodeURIComponent(text.replace(/^file:\/\/\/?/, '').replace(/\//g, '\\'))
      : text
    if (
      candidate &&
      !candidate.includes('\n') &&
      extname(candidate).toLowerCase() === '.png' &&
      existsSync(candidate)
    ) {
      return candidate
    }
  } catch {
    // ignore
  }

  return null
}

/**
 * Extract PNG text metadata from clipboard image / PNG file.
 * Throws if clipboard has no PNG, or PNG has no text chunks.
 */
export function readClipboardPngMetadata(): Record<string, unknown> {
  const buf = readClipboardPngBuffer()
  if (!buf) {
    throw new Error('剪贴板中没有 PNG 图片')
  }
  const info = extractPngInfo(buf)
  if (!Object.keys(info).length) {
    throw new Error('剪贴板图片没有可识别的生成元数据')
  }
  return info
}
