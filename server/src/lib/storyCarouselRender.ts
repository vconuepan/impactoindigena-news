import { createCanvas, type Image } from '@napi-rs/canvas'
import PDFDocument from 'pdfkit'
import archiver from 'archiver'
import { PassThrough } from 'node:stream'
import {
  C, FONT, W, H, SCALE, RW, RH, M,
  drawPill, drawLogo, drawCleanBg, drawPhotoBg, bottomGradient, exportCanvas, footerUrl, roundRect,
} from './carouselGen.js'
import { AI_LABEL } from './ai-label.js'
import { loadRemoteImage } from './loadRemoteImage.js'
import { FOTO_ANCHO_MINIMO } from './fotoDelMedio.js'
import { createLogger } from './logger.js'
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
 * LA FOTO ES DEL MEDIO, O NO HAY FOTO. Decisión del director, 29-oct-2026:
 * la portada y el cierre llevan la fotografía con que el medio publicó la nota
 * (`lib/fotoDelMedio.ts`), a sangre y con el crédito «Foto: <medio>» junto a
 * «Reporteó». Hasta ese día el carrusel salía sin foto (23-oct), y antes con
 * una ilustración de IA que el 24-oct inventó una escena. Si la noticia no
 * tiene foto del medio, o no se puede bajar, las dos láminas salen con el
 * fondo de marca: nunca una imagen de IA ni la tarjeta compuesta.
 *
 * MÁS FOTOS DEL MISMO MEDIO. Las demás fotos del artículo (`story_images`,
 * rehospedadas como `ogfoto-`) van en las láminas de desarrollo, una por
 * lámina, enmarcadas arriba del texto y con «Foto: <medio>» junto a
 * «Reporteó». Con una condición que manda sobre la foto: el texto conserva
 * sus mismos máximos de líneas, así que la foto nunca produce un aviso
 * `espacio` que antes no existía (en Instagram un aviso rechaza el post
 * entero). La foto se dibuja solo si, con el texto medido, queda sitio para
 * un marco de al menos MARCO_MIN; si no, esa lámina sale sin foto.
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

/** La foto del medio para la portada y el cierre, con a quién acreditarla. */
export interface FotoDeNoticia {
  url: string
  /** El medio, para «Foto: <medio>». */
  credito: string
}

export interface RenderInput {
  laminas: CarouselSlideText[]
  lectura: CarouselSlideText | null
  atribucion: CarouselAttribution
  /** Tema de la noticia, para la píldora de la portada. Puede ir vacío. */
  categoria: string
  /** `null` si la noticia no tiene foto del medio (`fotoDelMedio`). */
  foto?: FotoDeNoticia | null
  /**
   * Las demás fotos del artículo, en su orden, para las láminas de desarrollo:
   * la primera va en la primera lámina de desarrollo, y así. Las que sobran no
   * se dibujan.
   */
  fotosDesarrollo?: FotoDeNoticia[]
}

const log = createLogger('story-carousel-render')

export interface RenderResult {
  /** JPEG de 1080×1350, en el orden en que se publican. */
  imagenes: Buffer[]
  /** Textos que no caben. Vacío si todo cabe. */
  avisos: CarouselAviso[]
  /** Cuántas láminas de desarrollo salieron con foto del artículo. */
  fotosDibujadas: number
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

/**
 * La línea de atribución sobre el pie: «Reporteó: <medio> · <fecha>». Con
 * `credito`, a la derecha va «Foto: <medio>» y la atribución cede el espacio.
 */
function lineaDeAtribucion(ctx: any, texto: string, credito: string | null = null): void {
  ctx.fillStyle = C.mute
  ctx.font = `500 ${s(24)}px '${FONT}'`
  const y = RH - M - s(52)
  let maxW = RW - M * 2
  if (credito) {
    const foto = `Foto: ${credito}`
    ctx.textAlign = 'right'
    ctx.fillText(foto, RW - M, y)
    maxW -= ctx.measureText(foto).width + s(40)
  }
  ctx.textAlign = 'left'
  let t = texto
  while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…'
  ctx.fillText(t, M, y)
}

/**
 * Baja y decodifica la foto por la guardia SSRF. Si falla, las láminas salen
 * con el fondo de marca: una foto que no llega no detiene la publicación.
 * Una foto de menos de FOTO_ANCHO_MINIMO tampoco va: la de la portada puede
 * llegar en vivo desde el sitio del medio (`fotoDePortada`), sin el filtro de
 * ancho que las rehospedadas ya pasaron, y un ícono a sangre con el crédito
 * del medio es peor que una lámina sin foto.
 */
async function cargarFoto(foto: FotoDeNoticia | null | undefined): Promise<Image | null> {
  if (!foto) return null
  try {
    const imagen = await loadRemoteImage(foto.url)
    if (imagen.width < FOTO_ANCHO_MINIMO) {
      log.warn({ url: foto.url, width: imagen.width }, 'la foto del medio es demasiado chica para una lámina; sale sin foto')
      return null
    }
    return imagen
  } catch (err) {
    log.warn({ err, url: foto.url }, 'no se pudo cargar la foto del medio; la lámina sale sin foto')
    return null
  }
}

function reporteo(a: CarouselAttribution): string {
  return a.fecha ? `Reporteó: ${a.medio} · ${a.fecha}` : `Reporteó: ${a.medio}`
}

const ANCHO = RW - M * 2
// Zona útil entre el logo y la línea de atribución, en px de render.
const ZONA_ARRIBA = s(300)
const ZONA_ABAJO = s(1150)

/*
 * El marco de la foto en una lámina de desarrollo (px a 1×, lienzo de 1080×1350).
 * Empieza bajo el logo y el texto va debajo, con un aire de MARCO_AIRE.
 *
 * Medido el 29-oct-2026 con las fuentes reales (DM Sans 58/42 px a 2×, 43
 * caracteres por línea) y textos del formato del prompt (desarrollo de 25 a 40
 * palabras, título de 2 a 7): el texto ocupa de 4 a 7 líneas y deja, sobre
 * él y desde y=200, entre 398 px (40 palabras) y 572 px (25 palabras) con un
 * título de una línea, y entre 258 y 432 con uno de tres. Un texto de 48
 * palabras (9 líneas) deja 282 o 142. De ahí los dos topes: por encima de 500
 * la foto le quita protagonismo al texto, y por debajo de 300 el marco es una
 * franja de 3:1 que recorta cualquier foto. El texto no cede ni una línea.
 */
const MARCO_Y = s(200)
const MARCO_MIN = s(300)
const MARCO_MAX = s(500)
const MARCO_AIRE = s(40)
const MARCO_RADIO = s(28)

/** La foto cubriendo el marco (cover-fit, centrada), con esquinas redondeadas. */
function dibujarFotoEnmarcada(ctx: any, foto: Image, x: number, y: number, w: number, h: number): void {
  ctx.save()
  roundRect(ctx, x, y, w, h, MARCO_RADIO)
  ctx.clip()
  const tr = w / h
  const sw = Math.min(foto.width, foto.height * tr)
  const sh = sw / tr
  ctx.drawImage(foto, (foto.width - sw) / 2, (foto.height - sh) / 2, sw, sh, x, y, w, h)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------
async function portada(l: CarouselSlideText, input: RenderInput, foto: Image | null, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  if (foto) {
    // La foto a sangre y el degradado de tinta: el texto va anclado abajo.
    drawPhotoBg(ctx, foto, 0)
    bottomGradient(ctx)
  } else {
    drawCleanBg(ctx)
  }
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
  dibujarLineas(ctx, bajada.lineas, M, yBajada, lhB, foto ? C.white : C.mute)

  lineaDeAtribucion(ctx, reporteo(input.atribucion), foto ? input.foto!.credito : null)
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [...avisoDeEspacio(0, 'titular', titulo, maxT), ...avisoDeEspacio(0, 'texto', bajada, maxB)],
  }
}

// ---------------------------------------------------------------------------
// Desarrollo: una idea por lámina
// ---------------------------------------------------------------------------
async function desarrollo(
  l: CarouselSlideText,
  indice: number,
  input: RenderInput,
  foto: { imagen: Image; credito: string } | null,
  n: number,
  total: number,
) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  drawCleanBg(ctx)
  await drawLogo(ctx, M, M, s(72))

  // Los máximos del texto son los mismos con y sin foto: la foto nunca
  // produce un aviso `espacio` que antes no existía.
  const fTitulo = `700 ${s(58)}px '${FONT}'`, lhT = s(70), maxT = 3
  const fTexto = `500 ${s(42)}px '${FONT}'`, lhX = s(58), maxX = 10
  const titulo = medir(ctx, l.titulo, fTitulo, ANCHO, maxT)
  const texto = medir(ctx, l.texto, fTexto, ANCHO, maxX)
  const alto = titulo.lineas.length * lhT + s(36) + texto.lineas.length * lhX

  // La foto, solo si con el texto ya medido queda sitio para el marco mínimo.
  const altoMarco = foto ? Math.min(MARCO_MAX, ZONA_ABAJO - MARCO_Y - MARCO_AIRE - alto) : 0
  const conFoto = foto !== null && altoMarco >= MARCO_MIN
  let y0: number
  if (conFoto) {
    dibujarFotoEnmarcada(ctx, foto!.imagen, M, MARCO_Y, ANCHO, altoMarco)
    y0 = MARCO_Y + altoMarco + MARCO_AIRE + s(54)
  } else {
    // Centrado en la zona útil, como siempre.
    y0 = ZONA_ARRIBA + Math.max(0, (ZONA_ABAJO - ZONA_ARRIBA - alto) / 2) + s(54)
  }
  ctx.textAlign = 'left'
  ctx.font = fTitulo
  const yFinTitulo = dibujarLineas(ctx, titulo.lineas, M, y0, lhT, C.white, true)
  ctx.font = fTexto
  dibujarLineas(ctx, texto.lineas, M, yFinTitulo + s(36), lhX, C.white)

  lineaDeAtribucion(ctx, reporteo(input.atribucion), conFoto ? foto!.credito : null)
  footerUrl(ctx, n, total)
  return {
    imagen: exportCanvas(canvas),
    avisos: [...avisoDeEspacio(indice, 'título', titulo, maxT), ...avisoDeEspacio(indice, 'texto', texto, maxX)],
    conFoto,
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
async function cierre(l: CarouselSlideText, indice: number, input: RenderInput, foto: Image | null, n: number, total: number) {
  const canvas = createCanvas(RW, RH)
  const ctx = canvas.getContext('2d')
  if (foto) {
    // La misma foto, muy oscurecida: señala la nota original sin competir con el texto.
    drawPhotoBg(ctx, foto, 0.82)
    bottomGradient(ctx)
  } else {
    drawCleanBg(ctx)
  }
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
  // El crédito de la foto va con la nota original, no junto a la línea de IA:
  // esa línea es una regla binaria y no puede ceder espacio ni recortarse.
  if (foto) ctx.fillText(`Foto: ${input.foto!.credito}`, M, y + s(4) + s(36))

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
 * Exige al menos portada y cierre. La foto del medio, si viene, se baja una
 * sola vez y va en la portada y en el cierre; las fotos de desarrollo se
 * bajan solo las que tienen lámina (hay más láminas que fotos, o al revés).
 */
export async function renderStoryCarousel(input: RenderInput): Promise<RenderResult> {
  const { laminas } = input
  if (laminas.length < 2) throw new Error('El carrusel necesita al menos portada y cierre')

  const total = laminas.length + (input.lectura ? 1 : 0)
  const ultimo = laminas.length - 1
  const deDesarrollo = (input.fotosDesarrollo ?? []).slice(0, Math.max(0, ultimo - 1))
  const [foto, ...fotosDesarrollo] = await Promise.all([cargarFoto(input.foto), ...deDesarrollo.map(cargarFoto)])
  const trabajos: Array<Promise<{ imagen: Buffer; avisos: CarouselAviso[]; conFoto?: boolean }>> = []

  trabajos.push(portada(laminas[0], input, foto, 1, total))
  for (let i = 1; i < ultimo; i++) {
    const imagen = fotosDesarrollo[i - 1]
    const fotoDeLamina = imagen ? { imagen, credito: deDesarrollo[i - 1].credito } : null
    trabajos.push(desarrollo(laminas[i], i, input, fotoDeLamina, i + 1, total))
  }
  if (input.lectura) trabajos.push(lectura(input.lectura, input, ultimo + 1, total))
  trabajos.push(cierre(laminas[ultimo], ultimo, input, foto, total, total))

  const hechos = await Promise.all(trabajos)
  return {
    imagenes: hechos.map((h) => h.imagen),
    avisos: hechos.flatMap((h) => h.avisos),
    fotosDibujadas: hechos.filter((h) => h.conFoto).length,
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
