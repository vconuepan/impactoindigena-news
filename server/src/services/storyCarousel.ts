import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { publisherFromUrl } from '../lib/publisher.js'
import { uploadImageToR2 } from '../lib/imageStorage.js'
import { fotoDelMedio } from '../lib/fotoDelMedio.js'
import { revisarCarrusel, temaRespaldado, type CarouselAviso, type CarouselSlideText } from '../lib/storyCarouselGuards.js'
import { renderStoryCarousel, carruselEnZip, type CarouselAttribution, type FotoDeNoticia } from '../lib/storyCarouselRender.js'
import { buildStoryCarouselPrompt } from '../prompts/story-carousel.js'
import { storyCarouselSchema, storyCarouselWithReadingSchema } from '../schemas/llm.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { config } from '../config.js'

const log = createLogger('story-carousel')

/**
 * El carrusel de una noticia, desde el panel (ficha de la noticia).
 *
 * Dos pasos, y ninguno escribe en la base:
 * 1. `draftStoryCarousel` le pide al modelo el texto de las láminas a partir
 *    del ARTICULO ORIGINAL (`sourceContent`), nunca del resumen de Voces.
 * 2. `renderStoryCarouselImages` dibuja el texto que el editor aprobó, después
 *    de pasar los candados. Nada se publica: la salida es una descarga.
 *
 * Instagram y LinkedIn usan los mismos dos pasos sin editor
 * (`buildStoryCarouselForSocial`): ahí un aviso no se corrige, rechaza.
 */

/** Un error que el panel puede mostrar tal cual; la ruta responde 422. */
export class StoryCarouselError extends Error {
  constructor(message: string, public avisos: CarouselAviso[] = []) {
    super(message)
    this.name = 'StoryCarouselError'
  }
}

export class StoryNotFoundError extends Error {
  constructor() {
    super('Story not found')
    this.name = 'StoryNotFoundError'
  }
}

export interface StoryCarouselDraft {
  laminas: CarouselSlideText[]
  lectura: CarouselSlideText | null
  atribucion: CarouselAttribution
  avisos: CarouselAviso[]
}

const AUTORES_GENERICOS = /^(admin|administrator|administrador|editor|redacci[oó]n|staff|prensa)$/i

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago',
})

async function cargarNoticia(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { feed: true, issue: true },
  })
  if (!story) throw new StoryNotFoundError()
  return story
}

type NoticiaCargada = Awaited<ReturnType<typeof cargarNoticia>>

/**
 * Las fotos del cuerpo del artículo ya rehospedadas (`story_images.hosted_url`,
 * `ogfoto-`), en el orden del artículo, para las láminas de desarrollo. Solo
 * las rehospedadas: una fila sin `hostedUrl` es una foto que no se pudo bajar
 * o era demasiado chica, y la dirección original no se dibuja. Tolera que la
 * tabla no exista todavía: el carrusel sale como el 29-oct, con foto solo en
 * la portada y el cierre.
 */
async function fotosDelArticulo(storyId: string, credito: string): Promise<FotoDeNoticia[]> {
  try {
    const filas = await prisma.storyImage.findMany({
      where: { storyId, hostedUrl: { not: null } },
      select: { hostedUrl: true },
      orderBy: { position: 'asc' },
    })
    return filas.flatMap((f) => (f.hostedUrl ? [{ url: f.hostedUrl, credito }] : []))
  } catch (err) {
    log.warn({ storyId, err }, 'no se leyeron las fotos del artículo; el desarrollo sale sin fotos')
    return []
  }
}

/**
 * Quién reporteó. Si la URL quedó en news.google.com, el medio real nunca se
 * capturó y el carrusel no se puede atribuir: se rechaza en vez de firmar
 * «Reporteó: Google News».
 */
export function atribucionDe(story: NoticiaCargada): CarouselAttribution {
  const feedName = story.feed.displayTitle || story.feed.title
  let dominio = ''
  try {
    dominio = new URL(story.sourceUrl).hostname.replace(/^www\./, '')
  } catch { /* la valida abajo */ }
  // `publisherFromUrl` devuelve el dominio pelado cuando el medio no está en su
  // mapa («ictnews.org»). Si el feed es del propio medio, su nombre es mejor
  // firma («Indian Country Today»); si es un agregador, el dominio es lo único
  // cierto que hay.
  const desdeUrl = publisherFromUrl(story.sourceUrl, feedName)
  const esAgregador = /google news/i.test(feedName)
  const medio = desdeUrl === dominio && !esAgregador ? feedName.split(/\s[–—]\s/)[0].trim() : desdeUrl

  if (!dominio || dominio === 'news.google.com' || dominio === 'google.com') {
    throw new StoryCarouselError(
      'No se sabe qué medio reporteó esta noticia: la dirección guardada es la de Google News, no la del artículo. Sin a quién atribuirlo, no se arma el carrusel.',
    )
  }

  const autor = story.sourceAuthor?.trim()
  return {
    medio,
    autor: autor && !AUTORES_GENERICOS.test(autor) && autor.toLowerCase() !== medio.toLowerCase() ? autor : null,
    fecha: story.sourceDatePublished ? FORMATO_FECHA.format(story.sourceDatePublished) : null,
    tituloOriginal: story.sourceTitle,
    dominio,
  }
}

/** Recorta sin partir un emoji: una mitad suelta de un par sustituto hace que Azure responda 400. */
function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  let corte = max
  const codigo = texto.charCodeAt(corte - 1)
  if (codigo >= 0xd800 && codigo <= 0xdbff) corte -= 1
  return texto.slice(0, corte)
}

function limpiarLamina(l: CarouselSlideText): CarouselSlideText {
  return { titulo: l.titulo.replace(/\s+/g, ' ').trim(), texto: l.texto.replace(/\s+/g, ' ').trim() }
}

/**
 * La firma la dibuja el código. En la primera prueba con una nota en inglés
 * (23-oct-2026) el modelo pegó «Reporteó: ictnews.org» al final del cierre
 * aunque el prompt dice que se agrega sola; con eso la lámina la decía dos veces.
 */
function sinFirmaDelModelo(l: CarouselSlideText): CarouselSlideText {
  return { ...l, texto: l.texto.replace(/\s*Reporte[oó]\s*:.*$/i, '').trim() }
}

// ---------------------------------------------------------------------------
// Paso 1 · el texto
// ---------------------------------------------------------------------------

export async function draftStoryCarousel(storyId: string, conLectura: boolean): Promise<StoryCarouselDraft> {
  const story = await cargarNoticia(storyId)
  const atribucion = atribucionDe(story)

  const original = story.sourceContent?.trim() ?? ''
  if (original.length < config.storyCarousel.minSourceChars) {
    throw new StoryCarouselError(
      `El texto guardado del artículo original tiene ${original.length} caracteres, y hacen falta al menos ${config.storyCarousel.minSourceChars} para armar el carrusel sin inventar. Suele ser solo la bajada del feed.`,
    )
  }

  const prompt = buildStoryCarouselPrompt({
    sourceTitle: story.sourceTitle,
    sourceContent: recortar(original, config.storyCarousel.maxSourceChars),
    publisher: atribucion.medio,
    sourceDate: atribucion.fecha,
  }, conLectura)

  const schema = conLectura ? storyCarouselWithReadingSchema : storyCarouselSchema
  const llm = getLLMByTier(config.storyCarousel.modelTier).withStructuredOutput(schema, {
    method: 'functionCalling',
    includeRaw: true,
  })

  await rateLimitDelay()
  const { raw, parsed } = await withRetry(() => llm.invoke([new HumanMessage(prompt)]))
  const uso = (raw as any)?.usage_metadata
  log.info(
    { storyId, conLectura, inputTokens: uso?.input_tokens, outputTokens: uso?.output_tokens, sourceChars: original.length },
    'carousel text generated',
  )

  const resultado = parsed as { laminas: CarouselSlideText[]; lectura?: CarouselSlideText }
  const laminas = (resultado.laminas ?? []).map(limpiarLamina).map(sinFirmaDelModelo).filter((l) => l.titulo || l.texto)
  if (laminas.length < 3) {
    throw new StoryCarouselError('El modelo devolvió un carrusel incompleto. Vuelve a intentarlo.')
  }
  const lectura = conLectura && resultado.lectura ? sinFirmaDelModelo(limpiarLamina(resultado.lectura)) : null

  return {
    laminas,
    lectura,
    atribucion,
    avisos: revisarCarrusel(laminas, lectura, original),
  }
}

// ---------------------------------------------------------------------------
// Paso 2 · las láminas
// ---------------------------------------------------------------------------

export interface RenderRequest {
  laminas: CarouselSlideText[]
  lectura: CarouselSlideText | null
}

/**
 * Dibuja el texto que mandó el editor. Los candados corren acá otra vez, sobre
 * el texto editado: es el único punto por donde sale el carrusel. Devuelve los
 * avisos junto a las imágenes para que la vista previa muestre qué corregir.
 */
export async function renderStoryCarouselImages(storyId: string, req: RenderRequest) {
  const story = await cargarNoticia(storyId)
  const atribucion = atribucionDe(story)
  const laminas = req.laminas.map(limpiarLamina)
  const lectura = req.lectura ? limpiarLamina(req.lectura) : null

  const original = story.sourceContent ?? ''
  const avisosDeTexto = revisarCarrusel(laminas, lectura, original)
  // La foto con que el medio publicó la nota, acreditada a ese medio. Una
  // imagen de IA o la tarjeta compuesta no van (decisión del director, 29-oct).
  const fotoUrl = fotoDelMedio(story.imageUrl)
  const { imagenes, avisos: avisosDeEspacio, fotosDibujadas } = await renderStoryCarousel({
    laminas,
    lectura,
    atribucion,
    categoria: temaRespaldado(story.issue?.name ?? '', original),
    foto: fotoUrl ? { url: fotoUrl, credito: atribucion.medio } : null,
    // Las demás fotos del artículo, una por lámina de desarrollo mientras
    // quepan sin quitarle espacio al texto (ver `desarrollo` en el render).
    fotosDesarrollo: await fotosDelArticulo(storyId, atribucion.medio),
  })
  log.info({ storyId, laminas: imagenes.length, fotosDibujadas }, 'carousel rendered')

  return { story, imagenes, avisos: [...avisosDeTexto, ...avisosDeEspacio] }
}

// ---------------------------------------------------------------------------
// Sin editor: Instagram y LinkedIn
// ---------------------------------------------------------------------------

/**
 * El carrusel que se publica sin que nadie lo corrija: el Instagram automático
 * y la galería de LinkedIn. Mismo texto (informativo, sin la lectura), mismos
 * candados y mismo dibujo que el del panel, pero sin editor que resuelva un
 * aviso: cualquier aviso lo rechaza. Decisión del director, 25-oct-2026.
 *
 * Hasta ese día Instagram armaba su carrusel con el resumen y las razones que
 * escribe la IA de Voces, con una portada de IA y sin nombrar al medio. El
 * 24-oct publicó una lámina que decía solo «limitingFactors» y una portada con
 * uniformados y una retroexcavadora que el artículo de Radio Kurruf no reporta.
 */
export interface SocialCarousel {
  imagenes: Buffer[]
  laminas: CarouselSlideText[]
  atribucion: CarouselAttribution
  /** El texto del artículo original, para revisar también el pie. */
  original: string
  /** El mismo, recortado al tope que se le manda al modelo. */
  originalParaElModelo: string
}

export async function buildStoryCarouselForSocial(storyId: string): Promise<SocialCarousel> {
  const borrador = await draftStoryCarousel(storyId, false)
  if (borrador.avisos.length > 0) {
    throw new StoryCarouselError('El texto del carrusel no pasó los candados.', borrador.avisos)
  }
  const { story, imagenes, avisos } = await renderStoryCarouselImages(storyId, { laminas: borrador.laminas, lectura: null })
  if (avisos.length > 0) {
    throw new StoryCarouselError('El carrusel no pasó los candados al dibujarse.', avisos)
  }
  const original = story.sourceContent ?? ''
  return {
    imagenes,
    laminas: borrador.laminas,
    atribucion: borrador.atribucion,
    original,
    originalParaElModelo: recortar(original.trim(), config.storyCarousel.maxSourceChars),
  }
}

/**
 * Marca en el nombre de archivo de las láminas armadas desde el original. Un
 * borrador sin ella es del generador anterior (resumen de IA): no se publica,
 * se rehace. Al cambiar de generador quedaron borradores esperando en la base.
 */
const MARCA_ORIGINAL = '-original-'

export function armadoDesdeElOriginal(slideUrls: string[]): boolean {
  return slideUrls.length > 0 && slideUrls.every((url) => url.includes(MARCA_ORIGINAL))
}

/** Sube las láminas a R2 en orden y devuelve sus direcciones públicas. */
export async function subirCarrusel(storyId: string, imagenes: Buffer[]): Promise<string[]> {
  const momento = Date.now()
  const urls: string[] = []
  for (let i = 0; i < imagenes.length; i++) {
    const nombre = `${storyId}${MARCA_ORIGINAL}${String(i + 1).padStart(2, '0')}-${momento}.jpg`
    urls.push(await uploadImageToR2(imagenes[i], nombre, 'image/jpeg'))
  }
  log.info({ storyId, laminas: urls.length }, 'carousel uploaded to R2')
  return urls
}

/** Los avisos en una línea, para guardarlos en el error del post. */
export function avisosEnTexto(avisos: CarouselAviso[]): string {
  return avisos.map((a) => a.mensaje).join(' · ')
}

/** El ZIP para descargar. Con cualquier aviso pendiente no se entrega. */
export async function buildStoryCarouselZip(storyId: string, req: RenderRequest) {
  const { story, imagenes, avisos } = await renderStoryCarouselImages(storyId, req)
  if (avisos.length > 0) {
    throw new StoryCarouselError('El carrusel tiene avisos sin resolver. Corrígelos en la vista previa antes de descargar.', avisos)
  }
  const nombre = `carrusel-${story.slug || story.id}`
  const zip = await carruselEnZip(imagenes, nombre)
  log.info({ storyId, laminas: imagenes.length, bytes: zip.length }, 'carousel zip built')
  return { zip, nombre }
}
