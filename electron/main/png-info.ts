import { inflateSync } from 'zlib'

/** Extract PNG text metadata (tEXt / zTXt / iTXt) as a key-value map. */
export function extractPngInfo(buffer: Buffer): Record<string, unknown> {
  if (buffer.length < 8 || buffer.subarray(0, 8).compare(PNG_SIG) !== 0) {
    throw new Error('不是有效的 PNG 文件')
  }

  const raw: Record<string, string> = {}
  let offset = 8

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) break

    const data = buffer.subarray(dataStart, dataEnd)

    if (type === 'tEXt') {
      const sep = data.indexOf(0)
      if (sep > 0) {
        const key = data.toString('latin1', 0, sep)
        raw[key] = data.toString('utf8', sep + 1)
      }
    } else if (type === 'zTXt') {
      const sep = data.indexOf(0)
      if (sep > 0 && sep + 2 <= data.length) {
        const key = data.toString('latin1', 0, sep)
        const method = data[sep + 1]
        if (method === 0) {
          raw[key] = inflateSync(data.subarray(sep + 2)).toString('utf8')
        }
      }
    } else if (type === 'iTXt') {
      const parsed = parseItxt(data)
      if (parsed) raw[parsed.key] = parsed.value
    } else if (type === 'IEND') {
      break
    }

    offset = dataEnd + 4
  }

  const info: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    info[key] = tryParseJson(value)
  }
  return info
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function tryParseJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function parseItxt(data: Buffer): { key: string; value: string } | null {
  const keyEnd = data.indexOf(0)
  if (keyEnd <= 0 || keyEnd + 3 >= data.length) return null

  const key = data.toString('latin1', 0, keyEnd)
  const compressionFlag = data[keyEnd + 1]
  const compressionMethod = data[keyEnd + 2]
  let pos = keyEnd + 3

  const langEnd = data.indexOf(0, pos)
  if (langEnd < 0) return null
  pos = langEnd + 1

  const translatedEnd = data.indexOf(0, pos)
  if (translatedEnd < 0) return null
  pos = translatedEnd + 1

  const textBytes = data.subarray(pos)
  let value: string
  if (compressionFlag === 1) {
    if (compressionMethod !== 0) return null
    value = inflateSync(textBytes).toString('utf8')
  } else {
    value = textBytes.toString('utf8')
  }
  return { key, value }
}
