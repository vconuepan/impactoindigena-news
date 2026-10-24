import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { publisherFromUrl } from '../lib/publisher.js'
import { revisarCarrusel, temaRespaldado, type CarouselAviso, type CarouselSlideText } from '../lib/storyCarouselGuards.js'
import { renderStoryCarousel, carruselEnZip, type CarouselAttribution } from '../lib/storyCarouselRender.js'
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
  const { imagenes, avisos: avisosDeEspacio } = await renderStoryCarousel({
    laminas,
    lectura,
    atribucion,
    categoria: temaRespaldado(story.issue?.name ?? '', original),
  })

  return { story, imagenes, avisos: [...avisosDeTexto, ...avisosDeEspacio] }
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
