import { createCanvas } from '@napi-rs/canvas'
import PDFDocument from 'pdfkit'
import archiver from 'archiver'
import { PassThrough } from 'node:stream'
import {
  C, FONT, W, H, SCALE, RW, RH, M,
  drawPill, drawLogo, drawCleanBg, exportCanvas, footerUrl,
} from './carouselGen.js'
import { AI_LABEL } from './ai-label.js'
import type { CarouselAviso, CarouselSlideText } from './storyCarouselGuards.js'

/**
 * Las láminas del carrusel de una noticia, con el formato de Voces Indígenas.
 *
 * Mismo lienzo, paleta, tipografía, logo y pie que el carrusel que Voces ya
 * publica en Instagram (`carouselGen.ts`): 4:5, 1080×1350, DM Sans, fondo de
 * tinta con el brillo verde y el acento terracota. Lo que cambia es el texto,
 * que sale del artículo original, y el pie de cada lámina, que nombra al medio
 * que reporteó.
 *
 * SIN FOTOS. De las imágenes de las noticias, la mayoría es fotografía del
 * medio citado (112 de 154 en la portada del 7-sep-2026, ver
 * `client/src/lib/story-image.ts`), y ponerla en un carrusel propio no es
 * citarla. Una ilustración de IA, a su vez, se confundiría con el reporteo.
 *
 * NUNCA RECORTA EN SILENCIO. Un texto que no cabe se devuelve como aviso y
 * bloquea la descarga: una lámina publicada con «…» a media frase dice menos de
 * lo que el editor aprobó.
 */

export interface CarouselAttribution {
  /** El medio que reporteó, de `publisherFromUrl`. */
  medio: string
  autor: string | null
  /** Fecha del original en castellano, o null. */
  fecha: string | null
  tituloOriginal: string
  /** Dominio del artículo original, para la lámina de cierre. */
  dominio: string
}

export interface RenderInput {
  laminas: CarouselSlideText[]
  lectura: CarouselSlideText | null
  atribucion: CarouselAttribution
  /** Tema de la noticia, para la píldora de la portada. Puede ir vacío. */
  categoria: string
}

export interface RenderResult {
  /** JPEG de 1080×1350, en el orden en que se publican. */
  imagenes: Buffer[]
  /** Textos que no caben. Vacío si todo cabe. */
  avisos: CarouselAviso[]
}

const s = (n: number) => n * SCALE

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

/** Reparte el texto en líneas que caben en `maxW`, sin recortar nada. */
function partirEnLineas(ctx: any, texto: string, maxW: number): string[] {
  const palabras = limpiar(texto).split(' ').filter(Boolean)
  const lineas: string[] = []
  let linea = ''
  for (const palabra of palabras) {
    const prueba = linea ? `${linea} ${palabra}` : palabra
    if (ctx.measureText(prueba).width > maxW && linea) {
      lineas.push(linea)
      linea = palabra
    } else {
      linea = prueba
    }
  }
  if (linea) lineas.push(linea)
  return lineas
}

interface Bloque {
  lineas: string[]
  /** Cuántas líneas sobran; 0 si cabe. */
  sobran: number
}

/**
 * Mide un bloque con su fuente. Si sobra, deja `max` líneas con «…» al final,
 * para que la vista previa muestre dónde se corta, y lo informa en `sobran`.
 */
function medir(ctx: any, texto: string, font: string, maxW: number, max: number): Bloque {
  ctx.font = font
  const todas = partirEnLineas(ctx, texto, maxW)
  if (todas.length <= max) return { lineas: todas, sobran: 0 }
  const lineas = todas.slice(0, max)
  lineas[max - 1] = `${lineas[max - 1]} …`
  return { lineas, sobran: todas.length - max }
}

function avisoDeEspacio(lamina: number | 'lectura', parte: string, b: Bloque, max: number): CarouselAviso[] {
  if (b.sobran === 0) return []
  return [{
    lamina,
    tipo: 'espacio',
    mensaje: `El ${parte} no cabe en la lámina: ocupa ${max + b.sobran} líneas y caben ${max}. Acórtalo.`,
  }]
}

/** Dibuja líneas desde `y`; la última en el acento si `acentoFinal`. */
function dibujarLineas(ctx: any, lineas: string[], x: number, y: number, lh: number, color: string, acentoFinal = false): number {
  lineas.forEach((l, i) => {
    ctx.fillStyle = acentoFinal && i === lineas.length - 1 ? C.accent : color
    ctx.fillText(l, x, y + i * lh)
  })
  return y + lineas.length * lh
}

/** La línea de atribución sobre el pie: «Reporteó: <medio> · <fecha>». */
function lineaDeAtribucion(ctx: any, texto: string): void {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.mute
  ctx.font = `500 ${s(24)}px '${FONT}'`
  const maxW = RW - M * 2
  let t = texto
  while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…'
  ctx.fillText(t, M, RH - M - s(52))
}

function reporteo(a: CarouselAttribution): string {
  return a.fecha ? `Reporteó: ${a.medio} · ${a.fecha}` : `Reporteó: ${a.medio}`
}

const ANCHO = RW - M * 2
// Zona útil entre el logo y la línea de atribución, en px de render.
const ZONA_ARRIBA = s(300)
const ZONA_ABAJO = s(1150)

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------
async function portada(l: CarouselSlideText, input: RenderInput, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)
  await drawLogo(ctx, M, M, s(100))

  const fTitulo = `700 ${s(66)}px '${FONT}'`, lhT = s(80), maxT = 5
  const fBajada = `500 ${s(32)}px '${FONT}'`, lhB = s(44), maxB = 4
  const titulo = medir(ctx, l.titulo, fTitulo, ANCHO, maxT)
  const bajada = medir(ctx, l.texto, fBajada, ANCHO, maxB)

  // Anclado abajo, como la portada de Instagram: el bloque termina sobre la atribución.
  const yBajada = ZONA_ABAJO - (bajada.lineas.length - 1) * lhB
  const yTitulo = yBajada - s(78) - (titulo.lineas.length - 1) * lhT
  if (input.categoria) {
    drawPill(ctx, input.categoria.toUpperCase(), M, yTitulo - lhT - s(56), s(22), C.accent, C.white)
  }
  ctx.textAlign = 'left'
  ctx.font = fTitulo
  dibujarLineas(ctx, titulo.lineas, M, yTitulo, lhT, C.white, true)
  ctx.font = fBajada
  dibujarLineas(ctx, bajada.lineas, M, yBajada, lhB, C.mute)

  lineaDeAtribucion(ctx, reporteo(input.atribucion))
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [...avisoDeEspacio(0, 'titular', titulo, maxT), ...avisoDeEspacio(0, 'texto', bajada, maxB)],
  }
}

// ---------------------------------------------------------------------------
// Desarrollo: una idea por lámina
// ---------------------------------------------------------------------------
async function desarrollo(l: CarouselSlideText, indice: number, input: RenderInput, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)
  await drawLogo(ctx, M, M, s(72))

  const fTitulo = `700 ${s(58)}px '${FONT}'`, lhT = s(70), maxT = 3
  const fTexto = `500 ${s(42)}px '${FONT}'`, lhX = s(58), maxX = 10
  const titulo = medir(ctx, l.titulo, fTitulo, ANCHO, maxT)
  const texto = medir(ctx, l.texto, fTexto, ANCHO, maxX)

  // Centrado en la zona útil.
  const alto = titulo.lineas.length * lhT + s(36) + texto.lineas.length * lhX
  const y0 = ZONA_ARRIBA + Math.max(0, (ZONA_ABAJO - ZONA_ARRIBA - alto) / 2) + s(54)
  ctx.textAlign = 'left'
  ctx.font = fTitulo
  const yFinTitulo = dibujarLineas(ctx, titulo.lineas, M, y0, lhT, C.white, true)
  ctx.font = fTexto
  dibujarLineas(ctx, texto.lineas, M, yFinTitulo + s(36), lhX, C.white)

  lineaDeAtribucion(ctx, reporteo(input.atribucion))
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [...avisoDeEspacio(indice, 'título', titulo, maxT), ...avisoDeEspacio(indice, 'texto', texto, maxX)],
  }
}

// ---------------------------------------------------------------------------
// Lectura de Venancio Coñuepán Mesías (opcional)
// ---------------------------------------------------------------------------
async function lectura(l: CarouselSlideText, input: RenderInput, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)
  await drawLogo(ctx, M, M, s(72))

  ctx.textAlign = 'left'
  ctx.fillStyle = C.accent
  ctx.font = `700 ${s(190)}px '${FONT}'`
  ctx.fillText('“', M - s(8), s(360))
  ctx.font = `700 ${s(24)}px '${FONT}'`
  ctx.fillText('LA LECTURA DE VENANCIO COÑUEPÁN MESÍAS', M, s(440))

  const fTitulo = `700 ${s(50)}px '${FONT}'`, lhT = s(62), maxT = 3
  const fTexto = `500 ${s(36)}px '${FONT}'`, lhX = s(52), maxX = 10
  const titulo = medir(ctx, l.titulo, fTitulo, ANCHO, maxT)
  const texto = medir(ctx, l.texto, fTexto, ANCHO, maxX)
  ctx.font = fTitulo
  const yFinTitulo = dibujarLineas(ctx, titulo.lineas, M, s(540), lhT, C.white)
  ctx.font = fTexto
  dibujarLineas(ctx, texto.lineas, M, yFinTitulo + s(30), lhX, C.mute)

  // Es opinión: no se le atribuye al medio, se dice sobre qué nota se escribió.
  lineaDeAtribucion(ctx, `Opinión sobre la nota de ${input.atribucion.medio}`)
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [
      ...avisoDeEspacio('lectura', 'título', titulo, maxT),
      ...avisoDeEspacio('lectura', 'texto', texto, maxX),
    ],
  }
}

// ---------------------------------------------------------------------------
// Cierre: síntesis + nota original + declaración de IA
// ---------------------------------------------------------------------------
async function cierre(l: CarouselSlideText, indice: number, input: RenderInput, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)
  await drawLogo(ctx, M, M, s(72))
  const a = input.atribucion

  const fTitulo = `700 ${s(52)}px '${FONT}'`, lhT = s(64), maxT = 3
  const fTexto = `500 ${s(34)}px '${FONT}'`, lhX = s(48), maxX = 6
  const titulo = medir(ctx, l.titulo, fTitulo, ANCHO, maxT)
  const texto = medir(ctx, l.texto, fTexto, ANCHO, maxX)
  ctx.textAlign = 'left'
  ctx.font = fTitulo
  const yFinTitulo = dibujarLineas(ctx, titulo.lineas, M, s(380), lhT, C.white, true)
  ctx.font = fTexto
  let y = dibujarLineas(ctx, texto.lineas, M, yFinTitulo + s(28), lhX, C.white)

  // La nota original: medio, título con que la publicó y autor (art. 71 B de la
  // Ley 17.336: fuente, título y autor). El título original no se traduce.
  y = Math.max(y + s(40), s(830))
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(M, y - s(56), ANCHO, s(2))
  ctx.fillStyle = C.accent
  ctx.font = `700 ${s(22)}px '${FONT}'`
  ctx.fillText('LEE LA NOTA COMPLETA', M, y)
  ctx.fillStyle = C.white
  ctx.font = `700 ${s(34)}px '${FONT}'`
  ctx.fillText(a.autor ? `${a.medio} · ${a.autor}` : a.medio, M, y + s(52))
  const original = medir(ctx, `«${a.tituloOriginal}»`, `500 ${s(26)}px '${FONT}'`, ANCHO, 3)
  ctx.font = `500 ${s(26)}px '${FONT}'`
  y = dibujarLineas(ctx, original.lineas, M, y + s(98), s(36), C.mute)
  ctx.fillStyle = C.mute
  ctx.font = `500 ${s(24)}px '${FONT}'`
  ctx.fillText(a.dominio, M, y + s(4))

  // La declaración de IA va dibujada, no en el prompt: es una regla binaria.
  lineaDeAtribucion(ctx, AI_LABEL)
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [...avisoDeEspacio(indice, 'título', titulo, maxT), ...avisoDeEspacio(indice, 'texto', texto, maxX)],
  }
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

/**
 * Dibuja el carrusel: portada, desarrollo, la lectura (si hay) y el cierre.
 * Exige al menos portada y cierre.
 */
export async function renderStoryCarousel(input: RenderInput): Promise<RenderResult> {
  const { laminas } = input
  if (laminas.length < 2) throw new Error('El carrusel necesita al menos portada y cierre')

  const total = laminas.length + (input.lectura ? 1 : 0)
  const ultimo = laminas.length - 1
  const trabajos: Array<Promise<{ imagen: Buffer; avisos: CarouselAviso[] }>> = []

  trabajos.push(portada(laminas[0], input, 1, total))
  for (let i = 1; i < ultimo; i++) trabajos.push(desarrollo(laminas[i], i, input, i + 1, total))
  if (input.lectura) trabajos.push(lectura(input.lectura, input, ultimo + 1, total))
  trabajos.push(cierre(laminas[ultimo], ultimo, input, total, total))

  const hechos = await Promise.all(trabajos)
  return {
    imagenes: hechos.map((h) => h.imagen),
    avisos: hechos.flatMap((h) => h.avisos),
  }
}

/** Un PDF con una lámina por página: el formato de carrusel de LinkedIn. */
export function carruselEnPdf(imagenes: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false })
    const partes: Buffer[] = []
    doc.on('data', (c: Buffer) => partes.push(c))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)
    for (const img of imagenes) {
      doc.addPage({ size: [W, H], margin: 0 })
      doc.image(img, 0, 0, { width: W, height: H })
    }
    doc.end()
  })
}

/** El ZIP que se descarga: una imagen por lámina y el PDF del carrusel. */
export async function carruselEnZip(imagenes: Buffer[], nombre: string): Promise<Buffer> {
  const pdf = await carruselEnPdf(imagenes)
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } })
    const salida = new PassThrough()
    const partes: Buffer[] = []
    salida.on('data', (c: Buffer) => partes.push(c))
    salida.on('end', () => resolve(Buffer.concat(partes)))
    archive.on('error', reject)
    archive.pipe(salida)
    imagenes.forEach((img, i) => {
      archive.append(img, { name: `${nombre}/lamina-${String(i + 1).padStart(2, '0')}.jpg` })
    })
    archive.append(pdf, { name: `${nombre}/${nombre}.pdf` })
    void archive.finalize()
  })
}
