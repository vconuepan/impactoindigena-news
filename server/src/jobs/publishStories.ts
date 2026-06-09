import prisma from '../lib/prisma.js'
import { getStoryIdsByStatus, bulkUpdateStatus } from '../services/story.js'
import { translateStoriesBatch } from '../services/translation.js'
import { fetchOgImage } from '../lib/extract-og-image.js'
import { generateStoryImage } from '../lib/imageGen.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('publish_stories')

// Own AI editorial illustration per story instead of hotlinking the source
// outlet's photo (copyright exposure + no size/CLS control — design review
// 2026-06). Sequential: the image API is the bottleneck and stories/day is
// low. Falls back to the source og:image only if AI generation fails, so a
// story is never left without an image.
async function generateHeroImages(ids: string[]): Promise<void> {
  const r2PublicUrl = config.r2.publicUrl
  const stories = await prisma.story.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, sourceTitle: true, summary: true, imageUrl: true, sourceUrl: true },
  })

  for (const story of stories) {
    if (story.imageUrl && r2PublicUrl && story.imageUrl.startsWith(r2PublicUrl)) {
      continue // already has one of our own images
    }
    try {
      const url = await generateStoryImage(
        story.id,
        story.title || story.sourceTitle,
        story.summary || '',
        { orientation: 'landscape' },
      )
      await prisma.story.update({ where: { id: story.id }, data: { imageUrl: url } })
      log.info({ storyId: story.id }, 'AI hero image generated')
    } catch (err) {
      log.warn({ err, storyId: story.id }, 'AI hero image failed - falling back to source og:image')
      if (!story.imageUrl) {
        const imageUrl = await fetchOgImage(story.sourceUrl).catch(() => null)
        if (imageUrl) {
          await prisma.story.update({ where: { id: story.id }, data: { imageUrl } })
          log.info({ storyId: story.id }, 'fallback og:image extracted and saved')
        }
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
