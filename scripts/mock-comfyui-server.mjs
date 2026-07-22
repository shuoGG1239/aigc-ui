#!/usr/bin/env node
/**
 * Mock ComfyUI server for local UI debugging without a real ComfyUI install.
 *
 * Covers APIs used by aigc-ui:
 *   GET  /system_stats
 *   GET  /models/:folder  |  /api/models/:folder
 *   POST /prompt
 *   GET  /history/:prompt_id
 *   GET  /view?filename=&subfolder=&type=
 *   POST /interrupt
 *   WS   /ws?clientId=
 *
 * Usage:
 *   npm run mock:comfyui
 *   PORT=8188 MOCK_DELAY_MS=600 npm run mock:comfyui
 *
 * Then set app server URL to http://127.0.0.1:8188
 */

import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { deflateSync } from 'node:zlib'

const PORT = Number(process.env.PORT || 8188)
const DELAY_MS = Math.max(0, Number(process.env.MOCK_DELAY_MS || 800))

/** Fake model filenames aligned with shared/family defaults + extras for LoRA UI. */
const MODELS = {
  checkpoints: ['noobaiXLNAIXL_vPred10Version.safetensors', 'mock-sdxl.safetensors'],
  unet: ['anima-base-v1.0.safetensors', 'mock-anima-unet.safetensors'],
  clip: ['qwen_3_06b_base.safetensors', 'mock-clip.safetensors'],
  vae: ['qwen_image_vae.safetensors', 'mock-vae.safetensors'],
  loras: [
    'mock_lora.safetensors',
    'test_style.safetensors',
    'character_abc.safetensors',
  ],
  embeddings: [],
  controlnet: [],
}

/** @type {Map<string, Job>} */
const jobs = new Map()
/** @type {Set<import('node:net').Socket>} */
const wsClients = new Set()

/**
 * @typedef {{
 *   promptId: string
 *   workflow: Record<string, unknown>
 *   createdAt: number
 *   cancelled: boolean
 *   done: boolean
 *   filename: string
 *   png: Buffer | null
 *   width: number
 *   height: number
 *   steps: number
 *   seed: number
 *   saveNodeId: string
 * }} Job
 */

const server = createServer(async (req, res) => {
  try {
    await handleHttp(req, res)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mock-comfy]', msg)
    json(res, 500, { error: msg })
  }
})

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  acceptWebSocket(req, socket, head)
})

server.on('error', (err) => {
  if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
    console.error(`[mock-comfy] port ${PORT} already in use. Try:`)
    console.error(`  set PORT=8189&& npm run mock:comfyui`)
    console.error(`  (PowerShell: $env:PORT=8189; npm run mock:comfyui)`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-comfy] http://127.0.0.1:${PORT}`)
  console.log(`[mock-comfy] delay=${DELAY_MS}ms  (MOCK_DELAY_MS / PORT env)`)
  console.log('[mock-comfy] Point AIGC UI server URL here, then generate.')
})

async function handleHttp(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url
  const method = (req.method || 'GET').toUpperCase()

  // CORS for convenience
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'GET' && pathname === '/system_stats') {
    json(res, 200, {
      system: {
        os: 'mock',
        comfyui_version: '0.0.0-mock',
        python_version: '3.11.mock',
        pytorch_version: '2.0.mock',
        embedded_python: false,
        argv: ['mock-comfyui-server'],
      },
      devices: [
        {
          name: 'Mock GPU',
          type: 'cuda',
          index: 0,
          vram_total: 12 * 1024 ** 3,
          vram_free: 10 * 1024 ** 3,
          torch_vram_total: 12 * 1024 ** 3,
          torch_vram_free: 10 * 1024 ** 3,
        },
      ],
    })
    return
  }

  const modelsMatch =
    pathname.match(/^\/models\/([^/]+)$/) || pathname.match(/^\/api\/models\/([^/]+)$/)
  if (method === 'GET' && modelsMatch) {
    const folder = decodeURIComponent(modelsMatch[1])
    const list = MODELS[folder] ?? []
    json(res, 200, list)
    return
  }

  if (method === 'POST' && pathname === '/prompt') {
    const body = await readJson(req)
    const workflow = body?.prompt
    if (!workflow || typeof workflow !== 'object') {
      json(res, 400, { error: 'missing prompt' })
      return
    }
    const promptId = randomUUID()
    const meta = inspectWorkflow(workflow)
    const filename = `mock_${Date.now()}_${promptId.slice(0, 8)}.png`
    /** @type {Job} */
    const job = {
      promptId,
      workflow,
      createdAt: Date.now(),
      cancelled: false,
      done: false,
      filename,
      png: null,
      width: meta.width,
      height: meta.height,
      steps: meta.steps,
      seed: meta.seed,
      saveNodeId: meta.saveNodeId,
    }
    jobs.set(promptId, job)
    console.log(
      `[mock-comfy] queued ${promptId.slice(0, 8)}… ${meta.width}x${meta.height} steps=${meta.steps} seed=${meta.seed}`,
    )
    json(res, 200, { prompt_id: promptId, number: jobs.size, node_errors: {} })
    void runJob(job, typeof body?.client_id === 'string' ? body.client_id : '')
    return
  }

  const historyMatch = pathname.match(/^\/history\/([^/]+)$/)
  if (method === 'GET' && historyMatch) {
    const promptId = decodeURIComponent(historyMatch[1])
    const job = jobs.get(promptId)
    if (!job || !job.done) {
      json(res, 200, {})
      return
    }
    if (job.cancelled) {
      json(res, 200, {
        [promptId]: {
          prompt: [0, promptId, job.workflow, {}],
          outputs: {},
          status: {
            status_str: 'error',
            completed: true,
            messages: [['execution_error', { exception_message: 'interrupted' }]],
          },
        },
      })
      return
    }
    json(res, 200, {
      [promptId]: {
        prompt: [0, promptId, job.workflow, {}],
        outputs: {
          [job.saveNodeId]: {
            images: [
              {
                filename: job.filename,
                subfolder: '',
                type: 'output',
              },
            ],
          },
        },
        status: {
          status_str: 'success',
          completed: true,
          messages: [],
        },
      },
    })
    return
  }

  if (method === 'GET' && pathname === '/view') {
    const filename = url.searchParams.get('filename') || ''
    const job = [...jobs.values()].find((j) => j.filename === filename && j.png)
    if (!job?.png) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': job.png.length,
    })
    res.end(job.png)
    return
  }

  if (method === 'POST' && pathname === '/interrupt') {
    for (const job of jobs.values()) {
      if (!job.done) job.cancelled = true
    }
    json(res, 200, {})
    return
  }

  if (method === 'GET' && (pathname === '/' || pathname === '/object_info')) {
    json(res, 200, { mock: true, message: 'aigc-ui mock ComfyUI server' })
    return
  }

  json(res, 404, { error: `not found: ${method} ${pathname}` })
}

/**
 * @param {Job} job
 * @param {string} clientId
 */
async function runJob(job, clientId) {
  const steps = Math.max(1, job.steps)
  const tick = DELAY_MS / (steps + 2)

  wsBroadcast({
    type: 'execution_start',
    data: { prompt_id: job.promptId },
  })

  for (let i = 1; i <= steps; i++) {
    if (job.cancelled) break
    await sleep(tick)
    wsBroadcast({
      type: 'progress',
      data: { value: i, max: steps, prompt_id: job.promptId, node: '8' },
    })
    wsBroadcast({
      type: 'executing',
      data: { node: '8', prompt_id: job.promptId },
    })
  }

  if (job.cancelled) {
    job.done = true
    wsBroadcast({
      type: 'executing',
      data: { node: null, prompt_id: job.promptId },
    })
    return
  }

  await sleep(tick)
  job.png = buildMockPng(job)
  job.done = true

  wsBroadcast({
    type: 'executing',
    data: { node: null, prompt_id: job.promptId },
  })
  console.log(
    `[mock-comfy] done   ${job.promptId.slice(0, 8)}… ${job.filename} (${job.png.length} bytes)`,
  )
  void clientId
}

function inspectWorkflow(workflow) {
  let width = 512
  let height = 512
  let steps = 20
  let seed = Math.floor(Math.random() * 1e9)
  let saveNodeId = '9'

  for (const [id, node] of Object.entries(workflow)) {
    if (!node || typeof node !== 'object') continue
    const n = /** @type {{ class_type?: string, inputs?: Record<string, unknown> }} */ (node)
    const inputs = n.inputs || {}
    if (n.class_type === 'EmptyLatentImage') {
      width = Math.max(1, Math.round(Number(inputs.width) || width))
      height = Math.max(1, Math.round(Number(inputs.height) || height))
    }
    if (n.class_type === 'KSampler') {
      steps = Math.max(1, Math.round(Number(inputs.steps) || steps))
      if (inputs.seed !== undefined && inputs.seed !== null) {
        seed = Number(inputs.seed)
        if (!Number.isFinite(seed)) seed = 0
      }
    }
    if (n.class_type === 'SaveImage') {
      saveNodeId = id
    }
  }

  // Cap extreme sizes for mock speed (metadata still uses workflow values in prompt chunk)
  const maxSide = 2048
  width = Math.min(width, maxSide)
  height = Math.min(height, maxSide)

  return { width, height, steps, seed, saveNodeId }
}

/**
 * Solid PNG with ComfyUI-compatible tEXt `prompt` (+ `workflow` mirror).
 * Fill: vivid HSL color from seed ⊕ job id (so same seed still varies across jobs).
 * @param {Job} job
 */
function buildMockPng(job) {
  const { width, height, seed, workflow, promptId } = job
  const salt = hashString32(promptId || `${Date.now()}`)
  const { r, g, b, hex } = colorFromSeed(seed, salt)

  const promptJson = JSON.stringify(workflow)
  // UI-ish workflow stub (same graph) so extractors that look at either key work
  const workflowJson = JSON.stringify({
    extra: { mock: true, seed, fill: hex },
    nodes: [],
    links: [],
    prompt: workflow,
  })

  return encodePngRgba(width, height, r, g, b, 255, {
    prompt: promptJson,
    workflow: workflowJson,
  })
}

/** @param {string} s */
function hashString32(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Map seed+salt → saturated RGB (hue wraps full 360°, avoid near-gray).
 * @param {number} seed
 * @param {number} salt
 */
function colorFromSeed(seed, salt = 0) {
  let x = (Math.floor(Number(seed)) ^ (salt >>> 0)) >>> 0
  // splitmix32 — spreads close seeds into distant hues
  x = (x + 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  x = (x ^ (x >>> 16)) >>> 0

  const h = x % 360
  const s = 0.55 + ((x >>> 9) % 40) / 100 // 0.55–0.94
  const l = 0.38 + ((x >>> 17) % 28) / 100 // 0.38–0.65
  const { r, g, b } = hslToRgb(h, s, l)
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  return { r, g, b, hex }
}

/** @param {number} h 0–360 @param {number} s 0–1 @param {number} l 0–1 */
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (hp < 3) [r1, g1, b1] = [0, c, x]
  else if (hp < 4) [r1, g1, b1] = [0, x, c]
  else if (hp < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  const m = l - c / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

/** @param {Record<string, string>} textChunks */
function encodePngRgba(width, height, r, g, b, a, textChunks) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = 1 + width * 4
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    raw[row] = 0 // filter None
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const idat = deflateSync(raw)

  const parts = [signature, pngChunk('IHDR', ihdr)]
  for (const [key, value] of Object.entries(textChunks)) {
    parts.push(pngChunk('tEXt', Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'utf8')])))
  }
  parts.push(pngChunk('IDAT', idat))
  parts.push(pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function json(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// --- minimal WebSocket server (text frames only) ---

function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key']
  if (!key || typeof key !== 'string') {
    socket.destroy()
    return
  }
  const accept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
  )
  if (head?.length) socket.unshift(head)

  wsClients.add(socket)
  socket.on('close', () => wsClients.delete(socket))
  socket.on('error', () => {
    wsClients.delete(socket)
    try {
      socket.destroy()
    } catch {
      // ignore
    }
  })
  socket.on('data', (buf) => {
    // Respond to ping / ignore client payloads
    if (!buf.length) return
    const opcode = buf[0] & 0x0f
    if (opcode === 0x8) {
      socket.end()
      wsClients.delete(socket)
    } else if (opcode === 0x9) {
      // pong
      const payload = extractWsPayload(buf)
      socket.write(wsFrame(0xA, payload))
    }
  })

  // status greeting (ignored by client if unknown type)
  socket.write(wsFrame(0x1, Buffer.from(JSON.stringify({ type: 'status', data: { mock: true } }), 'utf8')))
}

function extractWsPayload(buf) {
  if (buf.length < 2) return Buffer.alloc(0)
  let len = buf[1] & 0x7f
  let off = 2
  if (len === 126) {
    len = buf.readUInt16BE(2)
    off = 4
  } else if (len === 127) {
    return Buffer.alloc(0)
  }
  const masked = (buf[1] & 0x80) !== 0
  if (masked) {
    const mask = buf.subarray(off, off + 4)
    off += 4
    const data = Buffer.from(buf.subarray(off, off + len))
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]
    return data
  }
  return Buffer.from(buf.subarray(off, off + len))
}

function wsFrame(opcode, payload) {
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x80 | opcode
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeUInt32BE(0, 2)
    header.writeUInt32BE(len, 6)
  }
  return Buffer.concat([header, payload])
}

function wsBroadcast(msg) {
  const payload = Buffer.from(JSON.stringify(msg), 'utf8')
  const frame = wsFrame(0x1, payload)
  for (const socket of wsClients) {
    try {
      socket.write(frame)
    } catch {
      wsClients.delete(socket)
    }
  }
}
