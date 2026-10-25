import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createLogger } from './logger.js'
import { config } from '../config.js'

/*
 * El lienzo de los carruseles de Voces Indígenas: fuente, paleta, logo, fondo,
 * pie y exportación. Las láminas las dibuja `storyCarouselRender.ts`, con el
 * texto que sale del artículo original.
 *
 * Hasta el 25-oct-2026 este archivo armaba además el carrusel de Instagram y
 * LinkedIn desde el resumen y las razones que escribe la IA de Voces, con una
 * portada de IA y una lámina de cierre con afirmaciones que el director había
 * retirado del sitio el 4-oct. Se reemplazó por el carrusel desde el original
 * (decisión del director, 25-oct-2026); ver services/storyCarousel.ts.
 */

const log = createLogger('carousel-gen')

// Register the brand font (DM Sans, DESIGN.md). The Azure App Service Linux
// container ships no system fonts, so without a registered bundled font
// @napi-rs/canvas renders no text at all (shapes draw, text is blank). The
// font file lives at <wwwroot>/assets/fonts and is deployed alongside dist/.
// 'DM Sans' is a variable font and covers both regular and bold weights.
export const FONT = 'DM Sans'
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
export const C = {
  green: '#0D5F3C',
  accent: '#E0712F',          // warm terracotta — reads on dark photos
  white: '#FFFFFF',
  ink: '#14110F',             // near-black warm
  mute: 'rgba(255,255,255,0.80)',
}

/*
 * El logo que va en cada slide del carrusel.
 *
 * Hasta el 17-sep-2026 era el logotipo de Impacto Indigena alojado en el
 * WordPress de esa marca: cada pieza publicada en Instagram salia firmada con
 * la marca anterior. Ahora sale del propio sitio, que ademas quita la
 * dependencia de un dominio que este repo no controla.
 */
const LOGO_WHITE = `${config.siteUrl}/images/logo-horizontal-blanco.png`

// 4:5 vertical (1080×1350), rendered 2× for crispness
export const W = 1080, H = 1350, SCALE = 2
export const RW = W * SCALE, RH = H * SCALE
export const M = 70 * SCALE

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Pill (rounded chip) with text. Returns its total width. */
export function drawPill(ctx: any, text: string, x: number, y: number, fontPx: number, bg: string, fg: string): number {
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

let _logoWhite: any = null
async function getLogo(): Promise<any> {
  if (_logoWhite === null) {
    try { _logoWhite = await loadImage(LOGO_WHITE) } catch { _logoWhite = false }
  }
  return _logoWhite || null
}

export async function drawLogo(ctx: any, x: number, y: number, h: number, align: 'left' | 'center' = 'left'): Promise<void> {
  const logo = await getLogo()
  if (!logo) return
  const w = (logo.width / logo.height) * h
  ctx.drawImage(logo, align === 'center' ? (RW - w) / 2 : x, y, w, h)
}

/** Clean branded dark background: warm ink + a soft green glow. Every slide
 *  of the carousel uses it: there are no photos (see storyCarouselRender.ts). */
export function drawCleanBg(ctx: any): void {
  ctx.fillStyle = C.ink
  ctx.fillRect(0, 0, RW, RH)
  const rg = ctx.createRadialGradient(RW * 0.5, RH * 0.30, 0, RW * 0.5, RH * 0.30, RW * 0.85)
  rg.addColorStop(0, 'rgba(13,95,60,0.42)')
  rg.addColorStop(1, 'rgba(20,17,15,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, RW, RH)
}

export function footerUrl(ctx: any, slideNum: number, total: number): void {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.mute
  ctx.font = `500 ${26 * SCALE}px '${FONT}'`
  ctx.fillText('vocesindigenas.org', M, RH - M)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.accent
  ctx.font = `700 ${24 * SCALE}px '${FONT}'`
  ctx.fillText(`${slideNum} / ${total}`, RW - M, RH - M)
  ctx.textAlign = 'left'
}

// Supersample: every slide renders at 2× (2160×2700) for crisp text, then we
// downscale to Instagram's native 1080×1350 before export. Uploading the full
// 2× image made Instagram re-compress it on its own downscale, softening the
// text. Exporting at native size keeps it sharp.
export function exportCanvas(canvas: any): Buffer {
  const out: any = createCanvas(W, H)
  const octx = out.getContext('2d')
  octx.drawImage(canvas, 0, 0, W, H)
  return out.toBuffer('image/jpeg', 92)
}
