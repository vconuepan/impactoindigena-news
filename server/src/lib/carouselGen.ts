import { createCanvas, loadImage } from '@napi-rs/canvas'
import { uploadImageToR2 } from './imageStorage.js'
import { createLogger } from './logger.js'

const log = createLogger('carousel-gen')

// Colores de marca — DESIGN.md
const BRAND = {
  brand: '#0D5F3C',     // Verde corporativo
  accent: '#C8473A',    // Terracota
  textMain: '#1C1917',  // Texto principal
  textMuted: '#78716C', // Texto secundario
  bgWarm: '#FAFAF8',    // Fondo blanco hueso
  white: '#FFFFFF',
  black: '#000000',
  // Paleta para barra arcoíris
  rainbowGreen: '#16A34A',
  rainbowYellow: '#EAB308',
  rainbowOrange: '#F97316',
}

const LOGO_WHITE = 'https://impactoindigena.com/wp-content/uploads/2025/04/cropped-logo-impacto-indigena_letras_blancas-1-scaled-1.png'
const LOGO_BLACK = 'https://impactoindigena.com/wp-content/uploads/2025/04/1-2.png'

// Formato 4:5 vertical (1080×1350 px), renderizado 2× para máxima nitidez
const W = 1080
const H = 1350
const SCALE = 2
const RENDER_W = W * SCALE   // 2160 px
const RENDER_H = H * SCALE   // 2700 px

// 60 px display → 120 px render — texto y logo fuera de la zona de recorte de Instagram
const MARGIN = 60 * SCALE

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Elimina markdown y caracteres problemáticos */
function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/`/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}

/** Texto con word-wrap; retorna Y de la línea siguiente al último texto dibujado */
function drawWrappedText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = 10,
): number {
  const words = cleanText(text).split(' ')
  let line = ''
  let currentY = y
  let lineCount = 0

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' '
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && line !== '') {
      if (lineCount >= maxLines - 1 && i < words.length - 1) {
        let truncated = line.trim()
        while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1)
        }
        ctx.fillText(truncated + '…', x, currentY)
        return currentY + lineHeight
      }
      ctx.fillText(line.trim(), x, currentY)
      line = words[i] + ' '
      currentY += lineHeight
      lineCount++
    } else {
      line = testLine
    }
  }

  if (line.trim()) {
    ctx.fillText(line.trim(), x, currentY)
    currentY += lineHeight
  }

  return currentY
}

/** Descarga y dibuja el logo; fallback en texto si falla */
async function drawLogo(
  ctx: any,
  x: number,
  y: number,
  height: number,
  logoUrl: string,
): Promise<void> {
  try {
    const logo = await loadImage(logoUrl)
    const width = (logo.width / logo.height) * height
    ctx.drawImage(logo, x, y, width, height)
  } catch {
    ctx.font = `bold ${28 * SCALE}px Arial`
    ctx.fillText('IMPACTO INDÍGENA', x, y + height * 0.7)
  }
}

/** Barra arcoíris en el borde INFERIOR */
function drawRainbowBar(ctx: any): void {
  const colors = [BRAND.brand, BRAND.rainbowGreen, BRAND.rainbowYellow, BRAND.rainbowOrange, BRAND.accent]
  const bw = RENDER_W / colors.length
  const bh = 14 * SCALE
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(i * bw, RENDER_H - bh, bw, bh)
  })
}

/** Barra arcoíris en el borde SUPERIOR */
function drawRainbowBarTop(ctx: any): void {
  const colors = [BRAND.brand, BRAND.rainbowGreen, BRAND.rainbowYellow, BRAND.rainbowOrange, BRAND.accent]
  const bw = RENDER_W / colors.length
  const bh = 14 * SCALE
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(i * bw, 0, bw, bh)
  })
}

/** Exporta canvas como JPEG alta calidad */
function exportCanvas(sourceCanvas: any): Buffer {
  return sourceCanvas.toBuffer('image/jpeg', { quality: 92 })
}

/** Separa la primera oración como titular y el resto como cuerpo */
function extractHeadlineAndBody(text: string): { headline: string; body: string } {
  const cleaned = cleanText(text)
  const match = cleaned.match(/^(.+?[.!?])\s+(.+)$/s)
  if (match && match[1].length >= 30 && match[1].length <= 260) {
    return { headline: match[1], body: match[2].trim() }
  }
  // Fallback: primeras ~12 palabras como titular
  const words = cleaned.split(' ')
  const cutoff = Math.min(12, Math.ceil(words.length * 0.45))
  return {
    headline: words.slice(0, cutoff).join(' '),
    body: words.slice(cutoff).join(' '),
  }
}

/** Parsea bullets markdown en array de textos limpios */
function extractBullets(text: string): string[] {
  const lines = text.split(/\n+/).map((s: string) =>
    s.replace(/^[-*]\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*\*/g, '')
      .trim(),
  ).filter(Boolean)
  return lines.length > 0 ? lines : [cleanText(text)]
}

/**
 * Dibuja el footer editorial compartido (slides 2 y 3).
 * — Línea divisoria sutil
 * — Logo negro a la izquierda
 * — "IMPACTOINDIGENA.NEWS" a la derecha
 * — Número de slide abajo a la derecha
 */
async function drawEditorialFooter(
  ctx: any,
  slideNum: number,
  accentColor: string,
): Promise<void> {
  const sepY = RENDER_H - 340 * SCALE       // 2700 - 680 = 2020px render
  const logoY = sepY + 24 * SCALE           // 2020 + 48 = 2068px render
  const logoH = 60 * SCALE                  // 120px render
  const urlBaseline = logoY + logoH * 0.72  // vertical center of logo

  // Línea divisoria
  ctx.strokeStyle = BRAND.textMuted
  ctx.globalAlpha = 0.2
  ctx.lineWidth = 2 * SCALE
  ctx.beginPath()
  ctx.moveTo(MARGIN, sepY)
  ctx.lineTo(RENDER_W - MARGIN, sepY)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Logo negro
  await drawLogo(ctx, MARGIN, logoY, logoH, LOGO_BLACK)

  // URL
  ctx.fillStyle = BRAND.textMuted
  ctx.font = `${20 * SCALE}px Arial`
  ctx.textAlign = 'right'
  ctx.fillText('IMPACTOINDIGENA.NEWS', RENDER_W - MARGIN, urlBaseline)

  // Número de slide
  ctx.fillStyle = accentColor
  ctx.font = `bold ${20 * SCALE}px Arial`
  ctx.textAlign = 'right'
  ctx.fillText(`${slideNum} / 4`, RENDER_W - MARGIN, RENDER_H - MARGIN)
}

// ---------------------------------------------------------------------------
// Slide 1: Portada — Imagen IA + Título
// ---------------------------------------------------------------------------

async function generateSlide1(title: string, aiImageUrl: string): Promise<Buffer> {
  const canvas = createCanvas(RENDER_W, RENDER_H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = BRAND.black
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)

  // Imagen IA como fondo; si es el logo fallback, usar fondo oscuro decorativo
  const isLogoFallback =
    aiImageUrl.includes('cropped-logo-impacto-indigena') || aiImageUrl.includes('1-2.png')

  if (!isLogoFallback) {
    try {
      const bgImage = await loadImage(aiImageUrl)
      const targetRatio = RENDER_W / RENDER_H
      const srcW = Math.min(bgImage.width, bgImage.height * targetRatio)
      const srcH = srcW / targetRatio
      const srcX = (bgImage.width - srcW) / 2
      const srcY = (bgImage.height - srcH) / 2
      ctx.drawImage(bgImage, srcX, srcY, srcW, srcH, 0, 0, RENDER_W, RENDER_H)
    } catch {
      ctx.fillStyle = '#0f1923'
      ctx.fillRect(0, 0, RENDER_W, RENDER_H)
    }
  } else {
    // Fondo oscuro con acentos decorativos cuando no hay imagen IA
    const bgGrad = ctx.createLinearGradient(0, 0, RENDER_W, RENDER_H)
    bgGrad.addColorStop(0, '#0f1923')
    bgGrad.addColorStop(0.5, '#1a2a1a')
    bgGrad.addColorStop(1, '#0f1923')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, RENDER_W, RENDER_H)
    ctx.globalAlpha = 0.12
    ctx.fillStyle = BRAND.brand
    ctx.beginPath()
    ctx.arc(RENDER_W * 0.85, RENDER_H * 0.25, 400 * SCALE, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = BRAND.accent
    ctx.beginPath()
    ctx.arc(RENDER_W * 0.15, RENDER_H * 0.7, 300 * SCALE, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Degradado oscuro en la mitad inferior para legibilidad
  const grad = ctx.createLinearGradient(0, RENDER_H * 0.4, 0, RENDER_H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.72)')
  grad.addColorStop(1, 'rgba(0,0,0,0.93)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)

  // Logo blanco arriba
  await drawLogo(ctx, MARGIN, MARGIN, 90 * SCALE, LOGO_WHITE)

  // Etiqueta terracota
  ctx.fillStyle = BRAND.accent
  ctx.font = `bold ${24 * SCALE}px Arial`
  ctx.textAlign = 'left'
  ctx.fillText('IMPACTO INDÍGENA', MARGIN, RENDER_H * 0.63)

  // Título blanco grande
  ctx.fillStyle = BRAND.white
  ctx.font = `bold ${54 * SCALE}px Arial`
  drawWrappedText(ctx, cleanText(title), MARGIN, RENDER_H * 0.68, RENDER_W - MARGIN * 2, 70 * SCALE, 3)

  // Número de slide
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `${22 * SCALE}px Arial`
  ctx.textAlign = 'right'
  ctx.fillText('1 / 4', RENDER_W - MARGIN, RENDER_H - MARGIN)

  drawRainbowBar(ctx)
  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 2: RESUMEN — Estilo editorial
// ---------------------------------------------------------------------------

async function generateSlide2(text: string): Promise<Buffer> {
  const canvas = createCanvas(RENDER_W, RENDER_H)
  const ctx = canvas.getContext('2d')

  // Fondo blanco hueso
  ctx.fillStyle = BRAND.bgWarm
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)

  // Barra arcoíris arriba
  drawRainbowBarTop(ctx)

  // Logo negro arriba izquierda
  await drawLogo(ctx, MARGIN, MARGIN + 20 * SCALE, 70 * SCALE, LOGO_BLACK)

  // Extraer titular (primera oración) y cuerpo
  const { headline, body } = extractHeadlineAndBody(text)

  // ------- Barra vertical de acento verde corporativo -------
  // Cubre desde la etiqueta "RESUMEN" hasta el final del titular (aprox.)
  const accentBarX = MARGIN
  const accentBarY = 195 * SCALE   // 390px render — unos píxeles antes de la etiqueta
  const accentBarW = 12 * SCALE    // 24px render = 12px display — trazo visible pero fino
  const accentBarH = 500 * SCALE   // 1000px render — cubre etiqueta + titular completo
  ctx.fillStyle = BRAND.brand
  ctx.fillRect(accentBarX, accentBarY, accentBarW, accentBarH)

  const contentX = MARGIN + accentBarW + 20 * SCALE  // 20px display de separación

  // Etiqueta de sección
  ctx.fillStyle = BRAND.brand
  ctx.font = `bold ${22 * SCALE}px Arial`
  ctx.textAlign = 'left'
  ctx.fillText('RESUMEN', contentX, 238 * SCALE)

  // Subrayado terracota corto
  ctx.fillStyle = BRAND.accent
  ctx.fillRect(contentX, 248 * SCALE, 76 * SCALE, 5 * SCALE)

  // Titular grande y negro
  ctx.fillStyle = BRAND.textMain
  ctx.font = `bold ${57 * SCALE}px Arial`
  const headlineBottom = drawWrappedText(
    ctx,
    headline,
    contentX,
    300 * SCALE,
    RENDER_W - contentX - MARGIN,
    74 * SCALE,
    3,
  )

  // Línea divisoria sutil
  ctx.strokeStyle = BRAND.textMuted
  ctx.globalAlpha = 0.2
  ctx.lineWidth = 2 * SCALE
  ctx.beginPath()
  ctx.moveTo(contentX, headlineBottom + 20 * SCALE)
  ctx.lineTo(RENDER_W - MARGIN, headlineBottom + 20 * SCALE)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Cuerpo del texto en gris
  if (body) {
    ctx.fillStyle = BRAND.textMuted
    ctx.font = `${39 * SCALE}px Arial`
    drawWrappedText(
      ctx,
      body,
      contentX,
      headlineBottom + 60 * SCALE,
      RENDER_W - contentX - MARGIN,
      56 * SCALE,
      7,
    )
  }

  // Footer editorial
  await drawEditorialFooter(ctx, 2, BRAND.brand)

  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 3: ¿POR QUÉ IMPORTA? — Estilo editorial
// ---------------------------------------------------------------------------

async function generateSlide3(text: string): Promise<Buffer> {
  const canvas = createCanvas(RENDER_W, RENDER_H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = BRAND.bgWarm
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)

  drawRainbowBarTop(ctx)

  await drawLogo(ctx, MARGIN, MARGIN + 20 * SCALE, 70 * SCALE, LOGO_BLACK)

  // Extraer bullets; primero como titular, resto como cuerpo
  const bullets = extractBullets(text)
  const headline = bullets[0] || ''
  const bodyBullets = bullets.slice(1, 3)  // máx 2 bullets adicionales

  // ------- Barra vertical de acento terracota -------
  const accentBarX = MARGIN
  const accentBarY = 195 * SCALE
  const accentBarW = 12 * SCALE
  const accentBarH = 500 * SCALE
  ctx.fillStyle = BRAND.accent
  ctx.fillRect(accentBarX, accentBarY, accentBarW, accentBarH)

  const contentX = MARGIN + accentBarW + 20 * SCALE

  // Etiqueta de sección
  ctx.fillStyle = BRAND.brand
  ctx.font = `bold ${22 * SCALE}px Arial`
  ctx.textAlign = 'left'
  ctx.fillText('¿POR QUÉ IMPORTA?', contentX, 238 * SCALE)

  // Subrayado terracota
  ctx.fillStyle = BRAND.accent
  ctx.fillRect(contentX, 248 * SCALE, 76 * SCALE, 5 * SCALE)

  // Titular grande
  ctx.fillStyle = BRAND.textMain
  ctx.font = `bold ${57 * SCALE}px Arial`
  const headlineBottom = drawWrappedText(
    ctx,
    headline,
    contentX,
    300 * SCALE,
    RENDER_W - contentX - MARGIN,
    74 * SCALE,
    3,
  )

  // Línea divisoria
  ctx.strokeStyle = BRAND.textMuted
  ctx.globalAlpha = 0.2
  ctx.lineWidth = 2 * SCALE
  ctx.beginPath()
  ctx.moveTo(contentX, headlineBottom + 20 * SCALE)
  ctx.lineTo(RENDER_W - MARGIN, headlineBottom + 20 * SCALE)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Bullets del cuerpo con punto decorativo terracota
  if (bodyBullets.length > 0) {
    ctx.textAlign = 'left'
    let bodyY = headlineBottom + 62 * SCALE

    for (const bullet of bodyBullets) {
      if (!bullet.trim()) continue

      // Punto decorativo terracota
      ctx.fillStyle = BRAND.accent
      ctx.beginPath()
      ctx.arc(contentX + 10 * SCALE, bodyY - 14 * SCALE, 8 * SCALE, 0, Math.PI * 2)
      ctx.fill()

      // Texto del bullet
      ctx.fillStyle = BRAND.textMuted
      ctx.font = `${39 * SCALE}px Arial`
      bodyY = drawWrappedText(
        ctx,
        bullet,
        contentX + 28 * SCALE,
        bodyY,
        RENDER_W - contentX - 28 * SCALE - MARGIN,
        54 * SCALE,
        3,
      )
      bodyY += 18 * SCALE  // espacio entre bullets
    }
  }

  // Footer editorial
  await drawEditorialFooter(ctx, 3, BRAND.accent)

  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Slide 4: CTA — Fondo oscuro
// ---------------------------------------------------------------------------

async function generateSlide4(): Promise<Buffer> {
  const canvas = createCanvas(RENDER_W, RENDER_H)
  const ctx = canvas.getContext('2d')

  // Fondo oscuro verde muy profundo
  ctx.fillStyle = '#091510'
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)

  // Acento geométrico sutil
  ctx.globalAlpha = 0.07
  ctx.fillStyle = BRAND.brand
  ctx.beginPath()
  ctx.arc(RENDER_W * 0.85, RENDER_H * 0.15, 520 * SCALE, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Barra arcoíris arriba Y abajo (sandwich)
  drawRainbowBarTop(ctx)
  drawRainbowBar(ctx)

  const cx = RENDER_W / 2
  const offY = 260 * SCALE  // punto de inicio del contenido centrado

  // Logo blanco grande centrado
  const logoH = 200 * SCALE
  const logoAspect = 3.2
  const logoW = logoH * logoAspect
  await drawLogo(ctx, (RENDER_W - logoW) / 2, offY, logoH, LOGO_WHITE)

  // Texto principal blanco
  ctx.fillStyle = BRAND.white
  ctx.font = `bold ${60 * SCALE}px Arial`
  ctx.textAlign = 'center'
  ctx.fillText('Lee la noticia completa', cx, offY + 310 * SCALE)

  // URL en terracota
  ctx.fillStyle = BRAND.accent
  ctx.font = `${44 * SCALE}px Arial`
  ctx.fillText('impactoindigena.news', cx, offY + 400 * SCALE)

  // Separador verde corporativo
  ctx.strokeStyle = BRAND.brand
  ctx.lineWidth = 4 * SCALE
  ctx.beginPath()
  ctx.moveTo(MARGIN * 2, offY + 475 * SCALE)
  ctx.lineTo(RENDER_W - MARGIN * 2, offY + 475 * SCALE)
  ctx.stroke()

  // Tagline
  ctx.fillStyle = BRAND.textMuted
  ctx.font = `${38 * SCALE}px Arial`
  ctx.fillText('Noticias sobre pueblos indígenas', cx, offY + 580 * SCALE)
  ctx.fillText('curadas con IA por Impacto Indígena', cx, offY + 658 * SCALE)

  // Hashtags en verde corporativo
  ctx.fillStyle = BRAND.brand
  ctx.font = `bold ${36 * SCALE}px Arial`
  ctx.fillText('#PueblosIndígenas  #ImpactoIndígena', cx, offY + 780 * SCALE)

  // Número de slide
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `${22 * SCALE}px Arial`
  ctx.textAlign = 'right'
  ctx.fillText('4 / 4', RENDER_W - MARGIN, RENDER_H - MARGIN)

  return exportCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Main: Genera las 4 slides y las sube a R2
// ---------------------------------------------------------------------------

export interface CarouselSlide {
  imageUrl: string
  order: number
}

export async function generateCarousel(
  storyId: string,
  title: string,
  whyItMatters: string,
  considerations: string,
  storyUrl: string,
  aiImageUrl: string,
): Promise<CarouselSlide[]> {
  log.info({ storyId }, 'generating Instagram carousel')

  const timestamp = Date.now()

  const [slide1, slide2, slide3, slide4] = await Promise.all([
    generateSlide1(title, aiImageUrl),
    generateSlide2(whyItMatters),
    generateSlide3(considerations),
    generateSlide4(),
  ])

  const slides = [
    { buffer: slide1, order: 1 },
    { buffer: slide2, order: 2 },
    { buffer: slide3, order: 3 },
    { buffer: slide4, order: 4 },
  ]

  const uploaded: CarouselSlide[] = []

  for (const slide of slides) {
    const filename = `${storyId}-slide${slide.order}-${timestamp}.jpg`
    const url = await uploadImageToR2(slide.buffer, filename, 'image/jpeg')
    uploaded.push({ imageUrl: url, order: slide.order })
    log.info({ storyId, order: slide.order, url }, 'slide uploaded')
  }

  log.info({ storyId, slideCount: uploaded.length }, 'carousel generated')
  return uploaded
}
