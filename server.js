/**
 * Audio Fingerprint Bypass — Local Node.js Server
 * ================================================
 * Uses bundled ffmpeg (no installation required on Windows/Mac/Linux).
 * Run: node server.js
 */

import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Use bundled ffmpeg — works on Windows, Mac, Linux without any installation
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
console.log(`✅ Using bundled ffmpeg: ${ffmpegPath}`)

const execFileAsync = promisify(execFile)
const app = express()
const PORT = 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json())

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

app.post('/process', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received.' })
  }

  const speed  = Math.max(0.25, Math.min(4,   parseFloat(req.body.speed  ?? '1')))
  const pitch  = Math.max(-12,  Math.min(12,  parseFloat(req.body.pitch  ?? '0')))
  const volume = Math.max(-18,  Math.min(6,   parseFloat(req.body.volume ?? '0')))
  const hf     = Math.max(0,    Math.min(100, parseFloat(req.body.hf     ?? '0')))

  // Build pitch shift + time stretch filter chain
  const pitchRatio = Math.pow(2, pitch / 12)
  const tempo      = speed / pitchRatio

  // FFmpeg atempo only accepts 0.5–2.0 per instance — chain for extreme values
  const atempoFilters = []
  let remaining = tempo
  while (remaining < 0.5)  { atempoFilters.push('atempo=0.5'); remaining /= 0.5 }
  while (remaining > 2.0)  { atempoFilters.push('atempo=2.0'); remaining /= 2.0 }
  atempoFilters.push(`atempo=${remaining.toFixed(7)}`)

  const filters = [
    'aresample=44100',
    `asetrate=r=44100*${pitchRatio.toFixed(7)}`,
    ...atempoFilters,
    'aresample=44100',
  ]
  if (volume !== 0) filters.push(`volume=${volume}dB`)
  if (hf > 0)       filters.push(`lowpass=f=${Math.max(3500, Math.round(20000 - hf * 155))}`)

  const id      = randomBytes(8).toString('hex')
  const ext     = extname(req.file.originalname) || '.mp3'
  const inPath  = join(tmpdir(), `in_${id}${ext}`)
  const outPath = join(tmpdir(), `out_${id}.mp3`)

  try {
    await writeFile(inPath, req.file.buffer)

    const args = [
      '-y', '-i', inPath,
      '-vn',
      '-af', filters.join(','),
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', '44100',
      outPath,
    ]

    console.log(`[${id}] speed=${speed} pitch=${pitch}st hf=${hf}%`)
    console.log(`[${id}] filters: ${filters.join(',')}`)

    await execFileAsync(ffmpegPath, args, { timeout: 180_000 })

    const result = await readFile(outPath)
    res.set('Content-Type', 'audio/mpeg')
    res.set('Content-Disposition', 'attachment; filename="processed.mp3"')
    res.send(result)

    console.log(`[${id}] Done — ${(result.length / 1024).toFixed(0)} KB`)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${id}] Error:`, msg)
    res.status(500).json({ error: msg || 'ffmpeg processing failed.' })
  } finally {
    await Promise.allSettled([unlink(inPath), unlink(outPath)])
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`\n🎵 Server ready at http://localhost:${PORT}`)
  console.log(`   Keep this terminal open while using the app.\n`)
})