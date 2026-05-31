import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { uploadImageToR2 } from './imageStorage.js'
import { createLogger } from './logger.js'

const log = createLogger('carousel-gen')

// Register the brand font (DM Sans, DESIGN.md). The Azure App Service Linux
// container ships no system fonts, so without a registered bundled font
// @napi-rs/canvas renders no text at all (shapes draw, text is blank). The
// font file lives at <wwwroot>/assets/fonts and is deployed alongside dist/.
// 'DM Sans' is a variable font and covers both regular and bold weights.
const FONT = 'DM Sans'
try {
  const here = path.dirname(fileURLToPath(import.meta.url)) // dist/lib
  const fontPath = path.resolve(here, '../../assets/fonts/DMSans.ttf')
  const ok = GlobalFonts.registerFromPath(fontPath, FONT)
  log.info({ fontPath, ok }, ok ? 'brand font registered' : 'brand font registration returned false')
} catch (err) {
  log.error({ err }, 'failed to register brand font - carousel text may not render')
}

// Brand palette (DESIGN.md). Editorial, photography-forward: dark surfaces,
// white text, one warm accent. No rainbow bars, no side-stripe borders.
const C = {
  green: '#0D5F3C',
  accent: '#E0712F',          // warm terracotta — reads on dark photos
  white: '#FFFFFF',
  ink: '#14110F',             // near-black warm
  mute: 'rgba(255,255,255,0.80)',
}

const LOGO_WHITE = 'https://impactoindigena.com/wp-content/uploads/2025/04/cropped-logo-impacto-indigena_letras_blancas-1-scaled-1.png'

// 4:5 vertical (1080×1350), rendered 2× for crispness
const W = 1080, H = 1350, SCALE = 2
const RW = W * SCALE, RH = H * SCALE
const M = 70 * SCALE

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '').replace(/`/g, '')
    .replace(/^[-•]\s*/gm, '')
    .replace(/\n+/g, ' ').trim()
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Pill (rounded chip) with text. Returns its total width. */
function drawPill(ctx: any, text: string, x: number, y: number, fontPx: number, bg: string, fg: string): number {
  ctx.font = `700 ${fontPx}px '${FONT}'`
  const padX = 22 * SCALE
  const tw = ctx.measureText(text).width
  const h = fontPx * 2.1
  ctx.fillStyle = bg
  roundRect(ctx, x, y, tw + padX * 2, h, h / 2)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 2)
  ctx.textBaseline = 'alphabetic'
  return tw + padX * 2
}

/** Word-wrap. Draws and returns Y of the next line. Truncates with … at maxLines. */
function wrapText(ctx: any, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 12): number {
  const words = cleanText(text).split(' ')
  let line = '', cy = y, n = 0
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' '
    if (ctx.measureText(test).width > maxW && line) {
      if (n >= maxLines - 1 && i < words.length - 1) {
        let t = line.trim()
        while (ctx.measureText(t + '…').width > maxW && t.length) t = t.slice(0, -1)
        ctx.fillText(t + '…', x, cy)
        return cy + lh
      }
      ctx.fillText(line.trim(), x, cy)
      line = words[i] + ' '
      cy += lh; n++
    } else line = test
  }
  if (line.trim()) { ctx.fillText(line.trim(), x, cy); cy += lh }
  return cy
}

/** Title that colors the LAST wrapped line in the accent (austerra-style). */
function drawTitle(ctx: any, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): void {
  const words = cleanText(text).split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line + w + ' '
    if (ctx.measureText(test).width > maxW && line) { lines.push(line.trim()); line = w + ' ' }
    else line = test
  }
  if (line.trim()) lines.push(line.trim())
  const shown = lines.slice(0, maxLines)
  shown.forEach((l, i) => {
    ctx.fillStyle = i === shown.length - 1 ? C.accent : C.white
    ctx.fillText(i === shown.length - 1 && lines.length > maxLines ? l + '…' : l, x, y + i * lh)
  })
}

let _logoWhite: any = null
async function getLogo(): Promise<any> {
  if (_logoWhite === null) {
    try { _logoWhite = await loadImage(LOGO_WHITE) } catch { _logoWhite = false }
  }
  return _logoWhite || null
}

async function drawLogo(ctx: any, x: number, y: number, h: number, align: 'left' | 'center' = 'left'): Promise<void> {
  const logo = await getLogo()
  if (!logo) return
  const w = (logo.width / logo.height) * h
  ctx.drawImage(logo, align === 'center' ? (RW - w) / 2 : x, y, w, h)
}

function isLogoFallback(url: string): boolean {
  return url.includes('cropped-logo-impacto-indigena') || url.includes('1-2.png')
}

/** Cover-fit a photo across the full canvas, then darken. Falls back to a dark
 *  warm gradient + soft green glow when there is no real AI image. */
async function drawBgPhoto(ctx: any, aiImageUrl: string, darken: number): Promise<void> {
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, RW, RH)
  if (!isLogoFallback(aiImageUrl)) {
    try {
      const p = await loadImage(aiImageUrl)
      const tr = RW / RH
      const sw = Math.min(p.width, p.height * tr)
      const sh = sw / tr
      ctx.drawImage(p, (p.width - sw) / 2, (p.height - sh) / 2, sw, sh, 0, 0, RW, RH)
      if (darken > 0) { ctx.fillStyle = `rgba(20,17,15,${darken})`; ctx.fillRect(0, 0, RW, RH) }
      return
    } catch { /* fall through to gradient */ }
  }
  const rg = ctx.createRadialGradient(RW / 2, RH * 0.42, 0, RW / 2, RH * 0.42, RW * 0.8)
  rg.addColorStop(0, 'rgba(13,95,60,0.40)')
  rg.addColorStop(1, 'rgba(20,17,15,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, RW, RH)
}

/** Clean branded dark background: warm ink + a soft green glow. Used on the
 *  text slides so the AI photo doesn't repeat on every slide (it appears only
 *  on the cover, full-bleed, and the resumen, framed). */
function drawCleanBg(ctx: any): void {
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, RW, RH)
  const rg = ctx.createRadialGradient(RW * 0.5, RH * 0.30, 0, RW * 0.5, RH * 0.30, RW * 0.85)
  rg.addColorStop(0, 'rgba(13,95,60,0.42)')
  rg.addColorStop(1, 'rgba(20,17,15,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, RW, RH)
}

function bottomGradient(ctx: any): void {
  const g = ctx.createLinearGradient(0, RH * 0.32, 0, RH)
  g.addColorStop(0, 'rgba(20,17,15,0)')
  g.addColorStop(0.55, 'rgba(20,17,15,0.55)')
  g.addColorStop(1, 'rgba(20,17,15,0.96)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, RW, RH)
}

function footerUrl(ctx: any, slideNum: number, total: number): void {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.mute
  ctx.font = `500 ${26 * SCALE}px '${FONT}'`
  ctx.fillText('impactoindigena.news', M, RH - M)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.accent
  ctx.font = `700 ${24 * SCALE}px '${FONT}'`
  ctx.fillText(`${slideNum} / ${total}`, RW - M, RH - M)
  ctx.textAlign = 'left'
}

// Supersample: every slide renders at 2× (2160×2700) for crisp text, then we
// downscale to Instagram's native 1080×1350 before export. Uploading the full
// 2× image made Instagram re-compress it on its own downscale, softening both
// text and photos. Exporting at native size keeps it sharp and the AI photo
// (≤1536px source) is downscaled — not upscaled — into the final frame.
function exportCanvas(canvas: any): Buffer {
  const out: any = createCanvas(W, H)
  const octx = out.getContext('2d')
  octx.drawImage(canvas, 0, 0, W, H)
  return out.toBuffer('image/jpeg', 92)
}

// ---------------------------------------------------------------------------
// Slide 1 — Cover: full-bleed photo + headline (accent last line)
// ---------------------------------------------------------------------------
async function generateSlide1(title: string, category: string, aiImageUrl: string, slideNum: number, total: number): Promise<Buffer> {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  await drawBgPhoto(ctx, aiImageUrl, 0)
  bottomGradient(ctx)
  await drawLogo(ctx, M, M, 100 * SCALE)

  const cat = (category || 'IMPACTO INDÍGENA').toUpperCase()
  drawPill(ctx, cat, M, RH - 560 * SCALE, 24 * SCALE, C.accent, C.white)

  ctx.font = `700 ${70 * SCALE}px '${FONT}'`
  drawTitle(ctx, title, M, RH - 420 * SCALE, RW - M * 2, 84 * SCALE, 4)

  footerUrl(ctx, slideNum, total)
  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 2 — Resumen: framed photo + editorial body
// ---------------------------------------------------------------------------
async function generateSlide2(summary: string, category: string, aiImageUrl: string, slideNum: number, total: number): Promise<Buffer> {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, RW, RH)

  await drawLogo(ctx, 0, M, 80 * SCALE, 'center')

  // Framed photo (rounded corners). Height kept moderate so the body text
  // below always fits above the footer (no overflow on long summaries).
  const fx = M, fy = 160 * SCALE, fw = RW - M * 2, fh = 520 * SCALE
  if (!isLogoFallback(aiImageUrl)) {
    try {
      const p = await loadImage(aiImageUrl)
      ctx.save()
      roundRect(ctx, fx, fy, fw, fh, 32 * SCALE)
      ctx.clip()
      const tr = fw / fh
      const sw = Math.min(p.width, p.height * tr)
      const sh = sw / tr
      ctx.drawImage(p, (p.width - sw) / 2, (p.height - sh) / 2, sw, sh, fx, fy, fw, fh)
      ctx.restore()
    } catch { /* skip frame */ }
    if (category) drawPill(ctx, category, fx + 22 * SCALE, fy + 22 * SCALE, 20 * SCALE, 'rgba(20,17,15,0.72)', C.white)
  }

  // Label + body — budgeted to end above the footer
  ctx.fillStyle = C.accent
  ctx.font = `700 ${24 * SCALE}px '${FONT}'`
  ctx.fillText('RESUMEN', M, fy + fh + 56 * SCALE)

  ctx.fillStyle = C.white
  ctx.font = `500 ${38 * SCALE}px '${FONT}'`
  wrapText(ctx, summary, M, fy + fh + 128 * SCALE, RW - M * 2, 52 * SCALE, 7)

  footerUrl(ctx, slideNum, total)
  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 3 — ¿Por qué importa?: bullets over a darkened photo
// ---------------------------------------------------------------------------
function extractBullets(text: string): string[] {
  const lines = text.split(/\n+/).map((s: string) =>
    s.replace(/^[-*•]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '').trim(),
  ).filter(Boolean)
  return lines.length ? lines : [cleanText(text)]
}

// Renders a "¿Por qué importa?" slide with a pre-chunked set of bullets
// (≤2 per slide so nothing truncates). `isFirst` shows the quote mark + label;
// continuation slides show "(cont.)".
async function generateRelevanceSlide(
  bullets: string[],
  _aiImageUrl: string,
  isFirst: boolean,
  slideNum: number,
  total: number,
): Promise<Buffer> {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)

  await drawLogo(ctx, M, M, 72 * SCALE)

  if (isFirst) {
    ctx.fillStyle = C.accent
    ctx.font = `700 ${190 * SCALE}px '${FONT}'`
    ctx.fillText('“', M - 8 * SCALE, 360 * SCALE)
  }

  ctx.fillStyle = C.accent
  ctx.font = `700 ${24 * SCALE}px '${FONT}'`
  ctx.fillText(isFirst ? 'POR QUÉ IMPORTA' : 'POR QUÉ IMPORTA (CONT.)', M, 440 * SCALE)

  let y = 540 * SCALE
  for (const b of bullets) {
    ctx.fillStyle = C.accent
    ctx.beginPath()
    ctx.arc(M + 9 * SCALE, y - 14 * SCALE, 8 * SCALE, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = C.white
    ctx.font = `500 ${36 * SCALE}px '${FONT}'`
    // Up to 6 lines per bullet at a slightly smaller size. With ≤2 bullets per
    // slide this fits the full reason without truncating, and the worst case
    // (2×6 lines) still ends well above the footer (~2352 < 2560 render px).
    y = wrapText(ctx, b, M + 34 * SCALE, y, RW - M * 2 - 34 * SCALE, 50 * SCALE, 6)
    y += 40 * SCALE
  }

  footerUrl(ctx, slideNum, total)
  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 4 — CTA
// ---------------------------------------------------------------------------
async function generateSlide4(): Promise<Buffer> {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, RW, RH)
  const rg = ctx.createRadialGradient(RW / 2, RH * 0.42, 0, RW / 2, RH * 0.42, RW * 0.7)
  rg.addColorStop(0, 'rgba(13,95,60,0.35)')
  rg.addColorStop(1, 'rgba(20,17,15,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, RW, RH)

  await drawLogo(ctx, 0, 300 * SCALE, 120 * SCALE, 'center')

  ctx.textAlign = 'center'

  // Headline: "El primer medio indígena AI-native." with AI-native in accent
  ctx.font = `700 ${52 * SCALE}px '${FONT}'`
  const pre = 'El primer medio indígena '
  const hi = 'AI-native.'
  const preW = ctx.measureText(pre).width
  const hiW = ctx.measureText(hi).width
  // wrap to two centered lines for balance
  ctx.fillStyle = C.white
  ctx.fillText('El primer medio indígena', RW / 2, 720 * SCALE)
  const x2 = RW / 2 - hiW / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = C.accent
  ctx.fillText('AI-native.', x2, 800 * SCALE)
  ctx.textAlign = 'center'
  void preW

  // Three value lines
  ctx.fillStyle = C.mute
  ctx.font = `500 ${30 * SCALE}px '${FONT}'`
  ctx.fillText('Curado por pueblos indígenas.', RW / 2, 940 * SCALE)
  ctx.fillText('Operado con inteligencia artificial.', RW / 2, 1000 * SCALE)
  ctx.fillText('Sin publicidad.', RW / 2, 1060 * SCALE)

  // url pill centered
  const t = 'impactoindigena.news'
  ctx.font = `700 ${30 * SCALE}px '${FONT}'`
  const tw = ctx.measureText(t).width
  const padX = 36 * SCALE, h = 84 * SCALE
  const px = (RW - (tw + padX * 2)) / 2, py = 1170 * SCALE
  ctx.fillStyle = C.accent
  roundRect(ctx, px, py, tw + padX * 2, h, h / 2)
  ctx.fill()
  ctx.fillStyle = C.white
  ctx.textBaseline = 'middle'
  ctx.fillText(t, RW / 2, py + h / 2 + 2)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export interface CarouselSlide {
  imageUrl: string
  order: number
}

export async function generateCarousel(
  storyId: string,
  title: string,
  summary: string,
  relevanceReasons: string,
  storyUrl: string,
  aiImageUrl: string,
  category: string = '',
): Promise<CarouselSlide[]> {
  log.info({ storyId }, 'generating Instagram carousel')

  const timestamp = Date.now()

  // Paginate the relevance bullets at most 2 per slide so long reasons never
  // get truncated — the carousel grows to 5 slides instead of cutting text.
  const allBullets = extractBullets(relevanceReasons).slice(0, 6)
  const BULLETS_PER_SLIDE = 2
  const bulletGroups: string[][] = []
  for (let i = 0; i < allBullets.length; i += BULLETS_PER_SLIDE) {
    bulletGroups.push(allBullets.slice(i, i + BULLETS_PER_SLIDE))
  }
  if (bulletGroups.length === 0) bulletGroups.push([cleanText(relevanceReasons)])

  // cover + resumen + N relevance slides + CTA
  const total = 2 + bulletGroups.length + 1

  const builders: Array<Promise<Buffer>> = [
    generateSlide1(title, category, aiImageUrl, 1, total),
    generateSlide2(summary, category, aiImageUrl, 2, total),
    ...bulletGroups.map((group, i) =>
      generateRelevanceSlide(group, aiImageUrl, i === 0, 3 + i, total),
    ),
    generateSlide4(),
  ]

  const buffers = await Promise.all(builders)

  const uploaded: CarouselSlide[] = []
  for (let i = 0; i < buffers.length; i++) {
    const order = i + 1
    const filename = `${storyId}-slide${order}-${timestamp}.jpg`
    const url = await uploadImageToR2(buffers[i], filename, 'image/jpeg')
    uploaded.push({ imageUrl: url, order })
    log.info({ storyId, order, url }, 'slide uploaded')
  }

  log.info({ storyId, slideCount: uploaded.length }, 'carousel generated')
  return uploaded
}
