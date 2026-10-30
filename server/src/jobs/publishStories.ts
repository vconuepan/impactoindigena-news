import prisma from '../lib/prisma.js'
import { getStoryIdsByStatus, bulkUpdateStatus } from '../services/story.js'
import { translateStoriesBatch } from '../services/translation.js'
import { fetchOgImage } from '../lib/extract-og-image.js'
import { generateStoryImage } from '../lib/imageGen.js'
import { rehostOrComposeStoryImage } from '../lib/storyCard.js'
import { rehostArticlePhoto } from '../lib/imageStorage.js'
import { assertUrlAllowed } from '../utils/urlValidation.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { publishHomepageSnapshot } from '../lib/homepage-snapshot.js'

const log = createLogger('publish_stories')

async function generateAiHero(story: {
  id: string
  title: string | null
  sourceTitle: string
  summary: string | null
}): Promise<string> {
  const url = await generateStoryImage(
    story.id,
    story.title || story.sourceTitle,
    story.summary || '',
    { orientation: 'landscape' },
  )
  await prisma.story.update({ where: { id: story.id }, data: { imageUrl: url } })
  return url
}

// Hero image strategy (cost-aware, revised 2026-07):
//   - Featured stories (relevance >= heroAiMinRelevance, the EditorialSeal
//     threshold) get an OWN AI editorial illustration — no copyright exposure,
//     full size/CLS control (design review 2026-06).
//   - The rest reuse the source outlet's og:image, RE-HOSTED on R2 (not
//     hotlinked) so we control hosting/availability and avoid a bare
//     third-party URL. Keeps image spend proportional to editorial value.
//     When no og:image exists, we fall back to an AI hero so a story is never
//     left imageless. If the R2 rehost fails, we fall back to the raw og:image
//     URL rather than leave the story without a hero, but ONLY if that URL
//     still passes the SSRF guard (see `urlSiLaGuardiaLaPermite`).
// A featured story whose AI generation fails also falls back to og:image.
// Sequential: the image API is the bottleneck and stories/day is low.
/**
 * El respaldo en crudo: devuelve la URL si la guardia SSRF la permite, o null.
 *
 * El rehospedaje devuelve null tanto si fallo R2 como si la guardia rechazo la
 * URL. Antes `rehosted ?? ogImage` guardaba la URL en los dos casos, asi que una
 * direccion interna que la guardia habia bloqueado quedaba como imagen de la nota
 * y despues la pedian el carrusel y la subida a LinkedIn. Aqui el veredicto de la
 * guardia no se pierde: lo que no pasa, no se guarda.
 */
async function urlSiLaGuardiaLaPermite(url: string, storyId: string): Promise<string | null> {
  try {
    await assertUrlAllowed(url)
    return url
  } catch (err) {
    log.warn({ storyId, url, err: (err as Error).message }, 'og:image rechazada por la guardia SSRF, no se guarda como imagen de la historia')
    return null
  }
}

export async function generateHeroImages(ids: string[]): Promise<void> {
  const r2PublicUrl = config.r2.publicUrl
  const minRelevance = config.imageGen.heroAiMinRelevance
  const stories = await prisma.story.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, title: true, sourceTitle: true, summary: true,
      imageUrl: true, sourceUrl: true, relevance: true,
    },
  })

  for (const story of stories) {
    if (story.imageUrl && r2PublicUrl && story.imageUrl.startsWith(r2PublicUrl)) {
      continue // already has one of our own images
    }

    const isFeatured = (story.relevance ?? 0) >= minRelevance

    if (isFeatured) {
      try {
        await generateAiHero(story)
        log.info({ storyId: story.id, relevance: story.relevance }, 'AI hero image generated (featured)')
        continue
      } catch (err) {
        log.warn({ err, storyId: story.id }, 'AI hero image failed - falling back to source og:image')
      }
    }

    // Non-featured, or a featured story whose AI generation just failed.
    const ogImage = await fetchOgImage(story.sourceUrl).catch(() => null)
    if (ogImage) {
      // Re-host on R2 so we don't hotlink the source. If the source image is
      // smaller than Discover's 1200px minimum, a branded card is composed from
      // it instead (zero AI cost). Fall back to the raw URL if both fail, so the
      // story still gets an image.
      const rehosted = await rehostOrComposeStoryImage(ogImage, story.id, story.title ?? story.sourceTitle)
      const finalUrl = rehosted ?? (await urlSiLaGuardiaLaPermite(ogImage, story.id))
      if (finalUrl) {
        await prisma.story.update({ where: { id: story.id }, data: { imageUrl: finalUrl } })
        log.info(
          { storyId: story.id, featured: isFeatured, rehosted: rehosted !== null },
          rehosted !== null
            ? 'source og:image rehosted to R2'
            : 'source og:image saved (rehost failed, hotlinking raw URL)',
        )
        continue
      }
      // La guardia la rechazo: se trata como si la fuente no tuviera og:image y se
      // cae a la heroe de IA de abajo (una destacada ya la intento antes).
    }

    // No og:image. For non-featured stories generate an AI hero as a last
    // resort so the story is never imageless. (A featured story already tried
    // AI above; don't retry it here.)
    if (!isFeatured) {
      try {
        await generateAiHero(story)
        log.info({ storyId: story.id }, 'AI hero image generated (no og:image fallback)')
      } catch (err) {
        log.warn({ err, storyId: story.id }, 'no image available (og:image + AI both failed)')
      }
    }
  }
}

/**
 * Las fotos del cuerpo del artículo (`story_images`, capturadas al extraer) se
 * rehospedan recién al publicar, como la og:image: el rastreo crea muchas más
 * noticias de las que se publican, y bajar y guardar sus fotos en R2 sería
 * pagar por lo que nunca se usa. Una por una, por la guardia SSRF y con el
 * mismo tope de tamaño; la que no pasa queda sin `hostedUrl` y el carrusel no
 * la usa. Nunca lanza: una foto que no llega no detiene la publicación.
 *
 * Tolera que la tabla no exista todavía (el SQL lo aplica el director).
 */
export async function rehostStoryPhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  let fotos: Array<{ id: string; storyId: string; position: number; sourceUrl: string }>
  try {
    fotos = await prisma.storyImage.findMany({
      where: { storyId: { in: ids }, hostedUrl: null },
      select: { id: true, storyId: true, position: true, sourceUrl: true },
      orderBy: [{ storyId: 'asc' }, { position: 'asc' }],
    })
  } catch (err) {
    log.warn({ err }, 'no se leyeron las fotos del artículo (¿falta aplicar el SQL de story_images?)')
    return
  }
  let subidas = 0
  for (const foto of fotos) {
    try {
      const url = await rehostArticlePhoto(foto.sourceUrl, foto.storyId, foto.position)
      if (!url) continue
      await prisma.storyImage.update({ where: { id: foto.id }, data: { hostedUrl: url } })
      subidas++
    } catch (err) {
      log.warn({ err, storyId: foto.storyId, position: foto.position }, 'foto del artículo: no se pudo rehospedar')
    }
  }
  log.info({ stories: ids.length, fotos: fotos.length, subidas }, 'article photos rehosted')
}

export async function runPublishStories(): Promise<void> {
  log.info('starting publish job')

  const ids = await getStoryIdsByStatus('selected')
  if (ids.length === 0) {
    log.info('no selected stories to publish')
    return
  }

  log.info({ storyCount: ids.length }, 'publishing stories')

  const result = await bulkUpdateStatus(ids, 'published')

  log.info({ published: result.count }, 'publish job finished')

  const publishedIds = ids
  if (publishedIds.length > 0) {
    // Translation first (fast, user-visible); image generation after (slow:
    // the image API can take minutes per story).
    log.info({ count: publishedIds.length }, 'translating published stories to English')
    const { translated, failed } = await translateStoriesBatch(publishedIds)
    log.info({ translated, failed }, 'translation complete')

    log.info({ count: publishedIds.length }, 'generating AI hero images')
    await generateHeroImages(publishedIds)

    // Las fotos del cuerpo del artículo, para las láminas de desarrollo del
    // carrusel. Después de las heroes: el carrusel se arma más tarde todavía.
    await rehostStoryPhotos(publishedIds)
  }

  // El snapshot va AL FINAL, despues de traducir y de generar las imagenes:
  // publicarlo antes lo congelaria sin los titulos en ingles y sin las heroes,
  // que son justo lo que la portada muestra. Nunca lanza -devuelve null si algo
  // falla- porque una portada que no se pudo cachear no es motivo para dar el
  // job por fallido: el endpoint sigue sirviendola.
  await publishHomepageSnapshot()
}
