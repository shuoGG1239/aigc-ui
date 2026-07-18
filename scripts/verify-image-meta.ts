/** Verify image-meta parsers against sample PNGs. */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { inflateSync } from 'zlib'
import { parseImageMeta } from '../web/src/utils/image-meta/parse'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function extractPngInfo(buffer: Buffer): Record<string, unknown> {
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
        raw[data.toString('latin1', 0, sep)] = data.toString('utf8', sep + 1)
      }
    } else if (type === 'zTXt') {
      const sep = data.indexOf(0)
      if (sep > 0 && sep + 2 <= data.length && data[sep + 1] === 0) {
        raw[data.toString('latin1', 0, sep)] = inflateSync(data.subarray(sep + 2)).toString(
          'utf8',
        )
      }
    } else if (type === 'IEND') break
    offset = dataEnd + 4
  }
  const info: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    const t = v.trim()
    if (t && (t[0] === '{' || t[0] === '[')) {
      try {
        info[k] = JSON.parse(t)
        continue
      } catch {
        /* keep string */
      }
    }
    info[k] = v
  }
  return info
}

const dir = process.argv[2] || 'C:\\Users\\Administrator\\Desktop\\all_case_png_info'
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'))

let failed = 0
for (const file of files) {
  const info = extractPngInfo(readFileSync(join(dir, file)))
  const { meta } = parseImageMeta(info)
  const ok = meta.source !== 'unknown' && !!meta.prompt.trim()
  if (!ok) failed++
  console.log(ok ? 'OK' : 'FAIL', meta.source.padEnd(8), file.slice(0, 48))
  console.log(
    ' ',
    [
      meta.width && meta.height ? `${meta.width}x${meta.height}` : 'no-size',
      meta.steps != null ? `${meta.steps} steps` : null,
      meta.cfg != null ? `cfg ${meta.cfg}` : null,
      meta.sampler || null,
      meta.seed ? `seed ${meta.seed}` : null,
      meta.model || null,
    ]
      .filter(Boolean)
      .join(' | '),
  )
  console.log('  prompt:', meta.prompt.slice(0, 90).replace(/\n/g, ' '))
  console.log()
}

if (failed) {
  console.error(`Failed: ${failed}/${files.length}`)
  process.exit(1)
}
console.log(`All ${files.length} samples parsed.`)
