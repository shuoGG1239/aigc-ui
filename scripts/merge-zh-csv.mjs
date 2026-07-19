/**
 * Merge tagcomplete zh translations: byzod first, Physton fills gaps.
 * Output: 2-column `en,zh` UTF-8 LF (no BOM).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmp = process.env.TEMP || process.env.TMP || '.'
const byzodPath = path.join(tmp, 'Tags-zh-full-pack.csv')
const phystonPath = path.join(tmp, 'danbooru.zh_CN.csv')
const outPath = path.join(
  __dirname,
  '../web/src/prompt/tag-complete/data/danbooru.zh_CN.csv',
)

function parseLine(line) {
  const parts = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (c === ',' && !q) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts.map((p) => p.trim())
}

/** Load map: enLower -> { en, zh }. Prefer first write (caller order). */
function loadInto(map, filePath, mode) {
  let text = fs.readFileSync(filePath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let added = 0
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = parseLine(line)
    let en = ''
    let zh = ''
    if (mode === 'byzod') {
      // 2-col preferred; some rows may be 3-col legacy
      if (parts.length >= 3 && parts[2]) {
        en = parts[0]
        zh = parts[2]
      } else {
        en = parts[0] || ''
        zh = parts[1] || ''
      }
    } else {
      en = parts[0] || ''
      zh = parts[1] || ''
    }
    en = en.trim()
    zh = zh.trim()
    if (!en || !zh) {
      skipped++
      continue
    }
    // Drop obvious junk: empty after strip pipes-only noise kept as-is
    const key = en.toLowerCase()
    if (map.has(key)) {
      skipped++
      continue
    }
    map.set(key, { en, zh })
    added++
  }
  return { added, skipped }
}

function csvEscape(s) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const map = new Map()
const by = loadInto(map, byzodPath, 'byzod')
const afterByzod = map.size
const ph = loadInto(map, phystonPath, 'physton')

const lines = []
for (const { en, zh } of map.values()) {
  lines.push(`${csvEscape(en)},${csvEscape(zh)}`)
}
// Stable-ish: keep insertion order (byzod then physton fills)
const body = `${lines.join('\n')}\n`
fs.writeFileSync(outPath, body, 'utf8')

console.log(
  JSON.stringify(
    {
      byzodAdded: by.added,
      phystonAdded: ph.added,
      total: map.size,
      afterByzod,
      outBytes: fs.statSync(outPath).size,
      outPath,
      samples: {
        '1girl': map.get('1girl')?.zh,
        breasts: map.get('breasts')?.zh,
        heterochromia: map.get('heterochromia')?.zh,
        looking_at_viewer: map.get('looking_at_viewer')?.zh,
      },
    },
    null,
    2,
  ),
)
