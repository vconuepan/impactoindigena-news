import prisma from '../lib/prisma.js'
import { getStoryIdsByStatus, bulkUpdateStatus } from '../services/story.js'
import { translateStoriesBatch } from '../services/translation.js'
import { fetchOgImage } from '../lib/extract-og-image.js'
import { generateStoryImage } from '../lib/imageGen.js'
import { rehostOrComposeStoryImage } from '../lib/storyCard.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'

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
//     URL rather than leave the story without a hero.
// A featured story whose AI generation fails also falls back to og:image.
// Sequential: the image API is the bottleneck and stories/day is low.
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
      const finalUrl = rehosted ?? ogImage
      await prisma.story.update({ where: { id: story.id }, data: { imageUrl: finalUrl } })
      log.info(
        { storyId: story.id, featured: isFeatured, rehosted: rehosted !== null },
        rehosted !== null
          ? 'source og:image rehosted to R2'
          : 'source og:image saved (rehost failed, hotlinking raw URL)',
      )
      continue
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
  }
}
