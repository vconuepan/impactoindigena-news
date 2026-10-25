import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { createCarouselPost, createSingleImagePost, getPostMetrics, isInstagramConfigured, InstagramAuthError } from '../lib/instagram.js'
import { revisarPie } from '../lib/storyCarouselGuards.js'
import {
  buildStoryCarouselForSocial, subirCarrusel, armadoDesdeElOriginal, avisosEnTexto,
  StoryCarouselError, type SocialCarousel,
} from './storyCarousel.js'
import { getMediumLLM, rateLimitDelay } from './llm.js'
import { buildInstagramCaptionPrompt } from '../prompts/instagram.js'
import { withAiLabel, AI_LABEL } from '../lib/ai-label.js'
import { config } from '../config.js'
const log = createLogger('instagram-service')

const instagramCaptionSchema = z.object({
  caption: z.string().describe('The complete Instagram caption, including body and hashtags.'),
})

/** Tope de caracteres del pie en Instagram. */
const TOPE_PIE = 2200

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

/*
 * DESDE EL 25-OCT-2026 EL CARRUSEL SALE DEL ARTICULO ORIGINAL (decisión del
 * director). Mismo texto, candados y dibujo que el carrusel del panel
 * (`services/storyCarousel.ts`), y el pie, en la voz de Venancio, escrito desde
 * el mismo original y revisado con los mismos candados. No hay editor que
 * resuelva un aviso: si el carrusel o el pie no pasan, el post queda
 * `rejected`, con el motivo en `error`, y no se publica.
 *
 * Antes se armaba con el resumen y las razones de la IA de Voces y una portada
 * de IA, sin nombrar al medio. El 24-oct salió así una lámina que decía solo
 * «limitingFactors» y una portada con uniformados y una retroexcavadora que el
 * artículo no reporta.
 */

export interface GenerateDraftOptions {
  /**
   * Esperar a que el borrador quede listo (o rechazado) antes de devolverlo. Lo
   * usa el job automático, que publica en la misma corrida. Hasta el
   * 25-oct-2026 no esperaba: publicaba un registro todavía en `generating`,
   * fallaba con «Can only publish draft posts», y el borrador salía en una
   * corrida posterior solo si el modelo volvía a elegir esa noticia. El panel
   * no espera: recibe el registro en `generating` y consulta hasta que cambie.
   */
  esperar?: boolean
}

export async function generateDraft(storyId: string, opciones: GenerateDraftOptions = {}) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { feed: true, issue: true },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title) throw new Error('Story must be fully analyzed')

  // A draft (or still-generating) post built from the original is returned so
  // the panel reopens seamlessly. A failed or rejected one is deleted and
  // regenerated, and so is a draft from the previous generator (AI summary):
  // that one must never be published. Published blocks.
  const existingPost = await prisma.instagramPost.findFirst({
    where: { storyId },
    include: { story: { include: { feed: true, issue: true } } },
  })
  if (existingPost) {
    if (existingPost.status === 'generating') return existingPost
    if (existingPost.status === 'draft' && armadoDesdeElOriginal(existingPost.slideUrls)) return existingPost
    if (existingPost.status === 'draft' || existingPost.status === 'failed' || existingPost.status === 'rejected') {
      await prisma.instagramPost.delete({ where: { id: existingPost.id } })
      log.info({ storyId, postId: existingPost.id, status: existingPost.status }, 'discarded Instagram post, regenerating from the original')
    } else {
      throw new Error('Story already has an Instagram post')
    }
  }

  // Create the record immediately in a 'generating' state. The work (carousel
  // text from the original, render, caption, R2 upload) runs after this and
  // flips the record to 'draft' or 'rejected'. The panel gets the record right
  // away and polls, so it never hits a proxy/browser timeout. Creating the row
  // now also reserves the unique storyId, so a double-click fails fast.
  const post = await prisma.instagramPost.create({
    data: { storyId, caption: '', imageUrl: '', slideUrls: [], status: 'generating' },
    include: { story: { include: { feed: true, issue: true } } },
  })

  const trabajo = runGeneration(post.id, story).catch(async (err) => {
    log.error({ err, storyId, postId: post.id }, 'Instagram generation failed')
    await prisma.instagramPost
      .update({ where: { id: post.id }, data: { status: 'failed', error: err instanceof Error ? err.message : 'Generation failed' } })
      .catch(() => {})
  })

  if (!opciones.esperar) {
    void trabajo
    return post
  }
  await trabajo
  return (await prisma.instagramPost.findUnique({
    where: { id: post.id },
    include: { story: { include: { feed: true, issue: true } } },
  })) ?? post
}

/** El post no se publica: queda `rejected` con el motivo, para verlo en el panel. */
async function rechazar(postId: string, storyId: string, motivo: string): Promise<void> {
  await prisma.instagramPost.update({ where: { id: postId }, data: { status: 'rejected', error: motivo } })
  log.warn({ postId, storyId, motivo }, 'Instagram post rejected by the carousel guards')
}

/**
 * El pie que se publica: el texto del modelo, la línea «Reporteó» y el enlace a
 * la ficha. Si no cabe junto a la línea de IA que se agrega al publicar, se
 * acorta el texto del modelo, nunca la atribución ni el enlace.
 */
export function pieConAtribucion(texto: string, medio: string, storyUrl: string): string {
  const cola = `\n\nReporteó: ${medio}\n${storyUrl}`
  const espacio = TOPE_PIE - cola.length - AI_LABEL.length - 2
  const cuerpo = texto.trim()
  if (cuerpo.length <= espacio) return cuerpo + cola
  let corte = espacio - 1
  const codigo = cuerpo.charCodeAt(corte - 1)
  if (codigo >= 0xd800 && codigo <= 0xdbff) corte -= 1 // no partir un emoji
  return cuerpo.slice(0, corte).trimEnd() + '…' + cola
}

/**
 * El pie sin la atribución ni los enlaces que agrega el código. La dirección de
 * la ficha lleva el titular de Voces, que escribe la IA: revisarla con los
 * candados sería revisar el resumen que justamente se dejó de usar.
 */
export function cuerpoDelPie(caption: string): string {
  return caption
    .split('\n')
    .filter((linea) => !/^\s*(Reporte[oó]\s*:|https?:\/\/)/i.test(linea))
    .join('\n')
}

// Builds the carousel and the caption from the original article, then uploads
// the slides and flips the record to 'draft'. Any guard warning → 'rejected'.
async function runGeneration(postId: string, story: any): Promise<void> {
  const storyId: string = story.id
  const storyUrl = `https://vocesindigenas.org/stories/${story.slug}`

  // Instagram toma las láminas de una dirección pública: sin R2 no hay carrusel.
  const r2Configured = Boolean(
    config.r2.endpoint && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.publicUrl,
  )
  if (!r2Configured) throw new Error('R2 no está configurado: Instagram necesita las láminas en una dirección pública')

  // 1. El carrusel, desde el artículo original y con los candados.
  let carrusel: SocialCarousel
  try {
    carrusel = await buildStoryCarouselForSocial(storyId)
  } catch (err) {
    if (err instanceof StoryCarouselError) {
      const avisos = err.avisos.length > 0 ? ` ${avisosEnTexto(err.avisos)}` : ''
      return rechazar(postId, storyId, `Carrusel: ${err.message}${avisos}`)
    }
    throw err
  }

  // 2. El pie, desde el mismo original, revisado con los mismos candados.
  await rateLimitDelay()
  const llm = getMediumLLM()
  const structuredLlm = llm.withStructuredOutput(instagramCaptionSchema, { method: 'functionCalling' })
  const prompt = buildInstagramCaptionPrompt({
    sourceTitle: story.sourceTitle,
    sourceContent: carrusel.originalParaElModelo,
    publisher: carrusel.atribucion.medio,
    issueName: story.issue?.name ?? null,
    sourceCountry: story.feed?.url ?? null,
  })
  const captionResult = await structuredLlm.invoke([new HumanMessage(prompt)])
  const avisosDelPie = revisarPie(captionResult.caption, carrusel.original)
  if (avisosDelPie.length > 0) {
    return rechazar(postId, storyId, `Pie: ${avisosEnTexto(avisosDelPie)}`)
  }
  const caption = pieConAtribucion(captionResult.caption, carrusel.atribucion.medio, storyUrl)

  // 3. Recién ahora se sube: un rechazo no deja láminas sueltas en R2.
  const imageUrls = await subirCarrusel(storyId, carrusel.imagenes)

  await prisma.instagramPost.update({
    where: { id: postId },
    data: { caption, imageUrl: imageUrls[0], slideUrls: imageUrls, status: 'draft' },
  })
  log.info({ postId, storyId, slideCount: imageUrls.length }, 'Instagram draft generated from the original')
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

export async function updateDraft(postId: string, caption: string) {
  const post = await prisma.instagramPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  // Los fallidos también se editan: publishPost los acepta para reintentar, y el
  // panel guarda el caption ANTES de publicar. Si acá se rechazan, tocar el texto
  // de un post fallido devuelve 400 y la publicación nunca se ejecuta — justo el
  // caso que hay que arreglar a mano.
  if (post.status !== 'draft' && post.status !== 'failed') {
    throw new Error('Can only edit draft posts')
  }

  return prisma.instagramPost.update({
    where: { id: postId },
    data: { caption },
    include: { story: { include: { feed: true, issue: true } } },
  })
}

export async function deletePostRecord(postId: string) {
  const post = await prisma.instagramPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  await prisma.instagramPost.delete({ where: { id: postId } })
  log.info({ postId, status: post.status }, 'deleted Instagram post record')
}

export async function listPosts(options: { status?: string; page?: number; limit?: number }) {
  const { status, page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [posts, total] = await Promise.all([
    prisma.instagramPost.findMany({
      where,
      include: { story: { include: { issue: true, feed: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.instagramPost.count({ where }),
  ])

  return { posts, total, page, limit }
}

export async function getPostById(postId: string) {
  return prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { story: { include: { issue: true, feed: true } } },
  })
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishPost(postId: string) {
  if (!isInstagramConfigured()) {
    throw new Error('Instagram credentials not configured')
  }

  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { story: true },
  })

  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft' && post.status !== 'failed') throw new Error('Can only publish draft posts')

  const slideUrls: string[] = post.slideUrls?.length ? post.slideUrls : (post.imageUrl ? [post.imageUrl] : [])
  if (slideUrls.length === 0) throw new Error('No images available for this post')

  // El único punto de salida, así que los candados corren otra vez acá: un
  // borrador del generador anterior (resumen de IA) no sale nunca, y el pie que
  // se haya editado en el panel pasa por la misma revisión que el generado.
  if (!armadoDesdeElOriginal(slideUrls)) {
    throw new Error('Este borrador se armó con el carrusel anterior, desde el resumen de IA. Bórralo y genera uno nuevo desde el artículo original.')
  }
  const avisosDelPie = revisarPie(cuerpoDelPie(post.caption), post.story.sourceContent ?? '')
  if (avisosDelPie.length > 0) {
    throw new Error(`El pie no pasó los candados: ${avisosEnTexto(avisosDelPie)}`)
  }

  // Publishing a carousel uploads each slide to Instagram one by one (~50s for
  // 5 slides), which exceeds the Azure Static Web Apps proxy timeout (~45s) and
  // made the client show a false "failed" while the server actually published.
  // Flip to 'publishing' and return immediately; do the upload in the
  // background, then mark 'published' / 'failed'. The client polls for status.
  const publishing = await prisma.instagramPost.update({
    where: { id: postId },
    data: { status: 'publishing', error: null },
    include: { story: { include: { feed: true, issue: true } } },
  })

  // 2200: tope de caracteres del caption en Instagram (el mismo con que se
  // recorta el borrador al generarlo). La línea de IA cabe siempre entera.
  void runPublish(postId, slideUrls, withAiLabel(post.caption, 2200)).catch(async (err) => {
    log.error({ err, postId }, 'background Instagram publish crashed')
    await prisma.instagramPost
      .update({ where: { id: postId }, data: { status: 'failed', error: err instanceof Error ? err.message : 'Publish failed' } })
      .catch(() => {})
  })

  return publishing
}

/** Background worker: upload slides to Instagram and finalize the post status. */
async function runPublish(postId: string, slideUrls: string[], caption: string): Promise<void> {
  try {
    // Use carousel for multiple slides, single-image for one
    const result = slideUrls.length > 1
      ? await createCarouselPost(slideUrls, caption)
      : await createSingleImagePost(slideUrls[0], caption)

    await prisma.instagramPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        instagramPostId: result.id,
        permalink: result.permalink,
        publishedAt: new Date(),
      },
    })

    log.info({ postId, instagramPostId: result.id, slideCount: slideUrls.length }, 'Instagram post published')
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.instagramPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish Instagram post')
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Update engagement metrics for all recent published posts.
 */
export async function updateMetrics() {
  if (!isInstagramConfigured()) {
    log.warn('Instagram not configured, skipping metrics update')
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - config.instagram.metrics.maxAgeDays)

  const posts = await prisma.instagramPost.findMany({
    where: {
      status: 'published',
      instagramPostId: { not: null },
      publishedAt: { gte: cutoff },
    },
  })

  if (posts.length === 0) {
    log.info('no published posts to update metrics for')
    return
  }

  log.info({ postCount: posts.length }, 'updating Instagram engagement metrics')

  let updated = 0
  let failed = 0

  for (const post of posts) {
    try {
      const metrics = await getPostMetrics(post.instagramPostId!)
      await prisma.instagramPost.update({
        where: { id: post.id },
        data: {
          likeCount: metrics.likeCount,
          commentCount: metrics.commentCount,
          metricsUpdatedAt: new Date(),
        },
      })
      updated++
    } catch (err) {
      // Si el token murió, ningún post va a funcionar: cortar en seco y
      // propagar para que el scheduler dispare la alerta. Antes se tragaba el
      // error post por post, el job terminaba "bien" y nadie se enteraba — así
      // pasaron 12 días de julio de 2026 con el posteo caído en silencio.
      if (err instanceof InstagramAuthError) {
        log.error({ err, updated, remaining: posts.length - updated }, 'Instagram token rejected, aborting metrics update')
        throw err
      }
      log.warn({ err, postId: post.id, instagramPostId: post.instagramPostId }, 'failed to update metrics for post')
      failed++
    }
  }

  log.info({ updated, failed }, 'Instagram metrics update complete')
}
