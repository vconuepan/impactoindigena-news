import { createCanvas, loadImage, GlobalFonts, type Image } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createLogger } from './logger.js'
import { downloadExternalImage, uploadImageToR2 } from './imageStorage.js'

const log = createLogger('story-card')

// Google Discover / news surfaces only show a large image card when the image
// is at least 1200px wide. Source outlets' og:images are sometimes smaller than
// that, which quietly makes those stories ineligible for the large card. Rather
// than spend on an AI hero (see publishStories heroAiMinRelevance), we compose a
// branded 1200×630 card from the small source image at zero AI/Azure cost —
// preserving the image-spend savings while making every story Discover-eligible.
export const STORY_CARD_MIN_WIDTH = 1200

// Register the brand font (DM Sans). The Azure App Service Linux container ships
// no system fonts, so without a bundled font @napi-rs/canvas renders no text.
// Same font file the carousel/agenda cards use. (Fraunces, the display serif in
// DESIGN.md, is only shipped to the client as woff2; server-generated cards
// standardize on DM Sans bold, matching the existing carousel/agenda cards.)
const FONT = 'DM Sans'
try {
  const here = path.dirname(fileURLToPath(import.meta.url)) // dist/lib
  const fontPath = path.resolve(here, '../../assets/fonts/DMSans.ttf')
  const ok = GlobalFonts.registerFromPath(fontPath, FONT)
  log.info({ fontPath, ok }, ok ? 'brand font registered' : 'brand font registration returned false')
} catch (err) {
  log.error({ err }, 'failed to register brand font - story card text may not render')
}

// Brand palette (DESIGN.md): editorial green + terracota accent.
const C = {
  green: '#0D5F3C',
  accent: '#C8473A',
  white: '#FFFFFF',
}

// 1200×630 landscape (the og:image / Discover ratio), rendered 2× for crispness.
const W = 1200, H = 630, SCALE = 2
const RW = W * SCALE, RH = H * SCALE
const M = 56 * SCALE

/** Draw `img` scaled to cover the whole canvas (center-cropped). */
function drawCover(ctx: any, img: Image, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/** Word-wrap `text` to at most `maxLines` lines fitting `maxWidth`, with an ellipsis. */
function wrapLines(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word
    if (ctx.measureText(trial).width <= maxWidth || !cur) {
      cur = trial
    } else {
      lines.push(cur)
      cur = word
      if (lines.length === maxLines - 1) break
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  // If words remain (text overflowed maxLines), ellipsize the last line.
  const used = lines.join(' ')
  if (used.length < text.length) {
    let last = lines[lines.length - 1] ?? ''
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.replace(/\s*\S+$/, '')
    }
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

/**
 * Compose a branded 1200×630 PNG from a (typically small) source image: the
 * source fills the card as a cover photo, a brand-green scrim rises from the
 * bottom, and the story title sits over it with an accent rule and the wordmark.
 * `img` is a pre-loaded @napi-rs/canvas Image.
 */
export function composeBrandedStoryCard(img: Image, title: string): Buffer {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')

  // Brand-green base (shows through if the cover has transparency).
  ctx.fillStyle = C.green
  ctx.fillRect(0, 0, RW, RH)

  // Source photo, full-bleed cover.
  drawCover(ctx, img, RW, RH)

  // Brand-green scrim rising from the bottom for legibility over any photo.
  const grad = ctx.createLinearGradient(0, RH * 0.35, 0, RH)
  grad.addColorStop(0, 'rgba(13,95,60,0)')
  grad.addColorStop(0.55, 'rgba(13,95,60,0.72)')
  grad.addColorStop(1, 'rgba(13,95,60,0.96)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, RW, RH)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Eyebrow wordmark.
  ctx.fillStyle = C.white
  ctx.font = `700 ${18 * SCALE}px '${FONT}'`
  const eyebrow = 'IMPACTO INDÍGENA'
  ctx.save()
  // Letter-spacing isn't supported directly; draw char by char with tracking.
  let ex = M
  const track = 3 * SCALE
  for (const ch of eyebrow) {
    ctx.fillText(ch, ex, RH - 168 * SCALE)
    ex += ctx.measureText(ch).width + track
  }
  ctx.restore()

  // Accent rule under the eyebrow.
  ctx.fillStyle = C.accent
  ctx.fillRect(M, RH - 150 * SCALE, 64 * SCALE, 5 * SCALE)

  // Title (up to 3 lines), bottom-left.
  ctx.fillStyle = C.white
  const titleSize = 44 * SCALE
  ctx.font = `700 ${titleSize}px '${FONT}'`
  const maxWidth = RW - M * 2
  const lines = wrapLines(ctx, title, maxWidth, 3)
  const lineGap = titleSize * 1.14
  let ty = RH - M - (lines.length - 1) * lineGap
  for (const line of lines) {
    ctx.fillText(line, M, ty)
    ty += lineGap
  }

  return canvas.toBuffer('image/png')
}

/**
 * Rehost a source og:image to R2 — but if the source is narrower than
 * STORY_CARD_MIN_WIDTH, upload a branded 1200×630 card composed from it instead,
 * so the story stays eligible for Google Discover's large-image card. Returns
 * the R2 public URL, or null on failure (caller falls back to the raw URL).
 */
export async function rehostOrComposeStoryImage(
  imageUrl: string,
  storyId: string,
  title: string,
): Promise<string | null> {
  const dl = await downloadExternalImage(imageUrl)
  if (!dl) return null

  const img = await loadImage(dl.buffer).catch(() => null)

  // Big enough already, or undecodable (can't measure or draw it) → rehost as-is.
  if (!img || img.width >= STORY_CARD_MIN_WIDTH) {
    try {
      return await uploadImageToR2(dl.buffer, `oghero-${storyId}.${dl.ext}`, dl.contentType)
    } catch (err) {
      log.warn({ err, storyId }, 'story image: verbatim rehost upload failed')
      return null
    }
  }

  // Small source → branded card. If composition fails, fall back to rehosting
  // the small original rather than leaving the story imageless.
  try {
    const card = composeBrandedStoryCard(img, title)
    const url = await uploadImageToR2(card, `storycard-${storyId}.png`, 'image/png')
    log.info({ storyId, sourceWidth: img.width }, 'composed branded story card for small source image')
    return url
  } catch (err) {
    log.warn({ err, storyId }, 'story image: branded card failed, rehosting small original')
    try {
      return await uploadImageToR2(dl.buffer, `oghero-${storyId}.${dl.ext}`, dl.contentType)
    } catch {
      return null
    }
  }
}
