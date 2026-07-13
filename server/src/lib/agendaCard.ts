import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { uploadImageToR2 } from './imageStorage.js'
import { createLogger } from './logger.js'
import { config } from '../config.js'
import type { DigestCounts } from '../services/agendaDigest.js'
import { AGENDA_SECTION_PATH, isoWeekKey } from '../services/agendaDigest.js'

const log = createLogger('agenda-card')

// Register the brand font (DM Sans, DESIGN.md). The Azure App Service Linux
// container ships no system fonts, so without a registered bundled font
// @napi-rs/canvas renders no text at all. Same font file the carousel uses.
const FONT = 'DM Sans'
try {
  const here = path.dirname(fileURLToPath(import.meta.url)) // dist/lib
  const fontPath = path.resolve(here, '../../assets/fonts/DMSans.ttf')
  const ok = GlobalFonts.registerFromPath(fontPath, FONT)
  log.info({ fontPath, ok }, ok ? 'brand font registered' : 'brand font registration returned false')
} catch (err) {
  log.error({ err }, 'failed to register brand font - agenda card text may not render')
}

// Brand palette (DESIGN.md).
const C = {
  green: '#0D5F3C',
  accent: '#E0712F',
  white: '#FFFFFF',
  mute: 'rgba(255,255,255,0.82)',
}

// 4:5 vertical (1080×1350), rendered 2× for crispness (matches carousel format).
const W = 1080, H = 1350, SCALE = 2
const RW = W * SCALE, RH = H * SCALE
const M = 90 * SCALE

/** Big-number rows, one per non-zero type, in a stable order. */
function countRows(counts: DigestCounts): { n: number; label: string }[] {
  const rows: { n: number; label: string }[] = []
  if (counts.evento > 0) rows.push({ n: counts.evento, label: counts.evento === 1 ? 'evento' : 'eventos' })
  if (counts.convocatoria > 0)
    rows.push({ n: counts.convocatoria, label: counts.convocatoria === 1 ? 'convocatoria' : 'convocatorias' })
  if (counts.oportunidad > 0)
    rows.push({ n: counts.oportunidad, label: counts.oportunidad === 1 ? 'oportunidad' : 'oportunidades' })
  if (counts.publicacion > 0)
    rows.push({ n: counts.publicacion, label: counts.publicacion === 1 ? 'publicación nueva' : 'publicaciones nuevas' })
  return rows
}

/** Render the weekly digest card to a PNG buffer. */
export function renderAgendaDigestCard(counts: DigestCounts): Buffer {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')

  // Solid brand-green surface.
  ctx.fillStyle = C.green
  ctx.fillRect(0, 0, RW, RH)

  // Eyebrow.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.accent
  ctx.font = `700 ${34 * SCALE}px '${FONT}'`
  ctx.fillText('ESTA SEMANA', M, 200 * SCALE)

  // Title.
  ctx.fillStyle = C.white
  ctx.font = `700 ${76 * SCALE}px '${FONT}'`
  ctx.fillText('Incidencia', M, 320 * SCALE)
  ctx.fillText('Internacional', M, 410 * SCALE)
  ctx.fillText('Indígena', M, 500 * SCALE)

  // Count rows: big number + label.
  const rows = countRows(counts)
  let y = 700 * SCALE
  const rowGap = 130 * SCALE
  for (const row of rows) {
    ctx.fillStyle = C.accent
    ctx.font = `700 ${96 * SCALE}px '${FONT}'`
    const numStr = String(row.n)
    ctx.fillText(numStr, M, y)
    const numW = ctx.measureText(numStr).width
    ctx.fillStyle = C.white
    ctx.font = `400 ${48 * SCALE}px '${FONT}'`
    ctx.fillText(row.label, M + numW + 28 * SCALE, y - 12 * SCALE)
    y += rowGap
  }

  // Footer: the section URL (host + path, no scheme, editorial style).
  const host = config.siteUrl.replace(/^https?:\/\//, '')
  ctx.fillStyle = C.mute
  ctx.font = `700 ${36 * SCALE}px '${FONT}'`
  ctx.fillText(`${host}${AGENDA_SECTION_PATH}`, M, RH - M)

  return canvas.toBuffer('image/png')
}

/**
 * Render the card and upload it to R2, returning its public URL.
 * Returns null when R2 is not configured (caller should skip Instagram then).
 */
export async function generateAndUploadAgendaCard(
  counts: DigestCounts,
  now: Date = new Date(),
): Promise<string | null> {
  if (!config.r2.publicUrl) {
    log.info('R2 not configured — skipping agenda digest card')
    return null
  }
  const buffer = renderAgendaDigestCard(counts)
  const filename = `agenda-digest-${isoWeekKey(now)}.png`
  const url = await uploadImageToR2(buffer, filename, 'image/png')
  log.info({ url }, 'agenda digest card uploaded')
  return url
}
