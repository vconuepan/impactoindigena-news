import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { createCarouselPost, createSingleImagePost, getPostMetrics, isInstagramConfigured } from '../lib/instagram.js'
import { generateCarousel } from '../lib/carouselGen.js'
import { generateStoryImage } from '../lib/imageGen.js'
import { getMediumLLM, rateLimitDelay } from './llm.js'
import { buildInstagramCaptionPrompt } from '../prompts/instagram.js'
import { config } from '../config.js'
const log = createLogger('instagram-service')

const instagramCaptionSchema = z.object({
  caption: z.string().describe('The complete Instagram caption, including body and hashtags.'),
})

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

export async function generateDraft(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { feed: true, issue: true },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title) throw new Error('Story must be fully analyzed')

  // If a draft (or still-generating) post exists, return it so the panel
  // reopens seamlessly. If it failed, delete and regenerate. Published blocks.
  const existingPost = await prisma.instagramPost.findFirst({
    where: { storyId },
    include: { story: { include: { feed: true, issue: true } } },
  })
  if (existingPost) {
    if (existingPost.status === 'draft' || existingPost.status === 'generating') return existingPost
    if (existingPost.status === 'failed') {
      await prisma.instagramPost.delete({ where: { id: existingPost.id } })
    } else {
      throw new Error('Story already has an Instagram post')
    }
  }

  // Create the record immediately in a 'generating' state and return it right
  // away. The heavy work (LLM caption, AI cover ~3 min, carousel render, R2
  // upload) runs in the background and flips the record to 'draft' when done.
  // This keeps the HTTP request fast so the admin panel never hits a
  // proxy/browser timeout — it polls the post until status becomes 'draft'.
  // Creating the row now also reserves the unique storyId, so a double-click
  // fails fast on the constraint instead of after a 3-minute generation.
  const post = await prisma.instagramPost.create({
    data: { storyId, caption: '', imageUrl: '', slideUrls: [], status: 'generating' },
    include: { story: { include: { feed: true, issue: true } } },
  })

  void runGeneration(post.id, story).catch(async (err) => {
    log.error({ err, storyId, postId: post.id }, 'background Instagram generation failed')
    await prisma.instagramPost
      .update({ where: { id: post.id }, data: { status: 'failed', error: err instanceof Error ? err.message : 'Generation failed' } })
      .catch(() => {})
  })

  return post
}

// Heavy generation work — runs in the background after generateDraft returns
// the 'generating' record. Builds the caption, AI cover, carousel + R2 uploads,
// then updates the record to 'draft'.
async function runGeneration(postId: string, story: any): Promise<void> {
  const storyId: string = story.id
  const storyUrl = `https://impactoindigena.news/stories/${story.slug}`

  // Caption para Instagram generada con LLM
  await rateLimitDelay()
  const llm = getMediumLLM()
  const structuredLlm = llm.withStructuredOutput(instagramCaptionSchema, { method: 'functionCalling' })

  const prompt = buildInstagramCaptionPrompt({
    title: story.title,
    titleLabel: story.titleLabel,
    summary: story.summary,
    relevanceSummary: story.relevanceSummary,
    relevanceReasons: story.relevanceReasons,
    marketingBlurb: story.marketingBlurb,
    issueName: story.issue?.name ?? null,
    sourceCountry: story.feed?.url ?? null,
  })

  const captionResult = await structuredLlm.invoke([new HumanMessage(prompt)])
  const captionWithUrl = `${captionResult.caption}\n\n${storyUrl}`
  const trimmedCaption = captionWithUrl.length > 2200 ? captionWithUrl.slice(0, 2197) + '…' : captionWithUrl

  // Reusar imagen de Twitter si existe y no es el logo de fallback
  const LOGO_FALLBACK_MARKERS = ['cropped-logo-impacto-indigena', '1-2.png']
  const twitterPost = await prisma.twitterPost.findFirst({
    where: { storyId, imageUrl: { not: null } },
  })
  const twitterImageUrl = twitterPost?.imageUrl ?? null
  const isLogoFallback = twitterImageUrl
    ? LOGO_FALLBACK_MARKERS.some((m) => twitterImageUrl.includes(m))
    : false

  let aiImageUrl = isLogoFallback ? null : twitterImageUrl

  if (!aiImageUrl) {
    try {
      aiImageUrl = await generateStoryImage(
        storyId,
        story.title,
        story.summary || story.marketingBlurb || '',
      )
      log.info({ storyId, aiImageUrl }, 'AI image generated for Instagram')
    } catch (err) {
      log.error({ err, storyId }, 'failed to generate AI image, using fallback')
      aiImageUrl = 'https://impactoindigena.com/wp-content/uploads/2025/04/cropped-logo-impacto-indigena_letras_blancas-1-scaled-1.png'
    }
  }

  const r2Configured = Boolean(
    config.r2.endpoint && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.publicUrl,
  )

  let imageUrls: string[]
  if (r2Configured) {
    const category = story.titleLabel || story.issue?.name || ''
    const slides = await generateCarousel(
      storyId,
      story.title,
      story.summary || '',
      story.relevanceReasons || '',
      storyUrl,
      aiImageUrl,
      category,
    )
    imageUrls = slides.sort((a, b) => a.order - b.order).map((s) => s.imageUrl)
    log.info({ storyId, slideCount: imageUrls.length }, 'carousel generated via R2')
  } else {
    log.info({ storyId }, 'R2 not configured — using single-image post')
    imageUrls = [aiImageUrl]
  }

  await prisma.instagramPost.update({
    where: { id: postId },
    data: { caption: trimmedCaption, imageUrl: imageUrls[0], slideUrls: imageUrls, status: 'draft' },
  })
  log.info({ postId, storyId, slideCount: imageUrls.length }, 'Instagram draft generated')
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

export async function updateDraft(postId: string, caption: string) {
  const post = await prisma.instagramPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft') throw new Error('Can only edit draft posts')

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

  void runPublish(postId, slideUrls, post.caption).catch(async (err) => {
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
      log.warn({ err, postId: post.id, instagramPostId: post.instagramPostId }, 'failed to update metrics for post')
      failed++
    }
  }

  log.info({ updated, failed }, 'Instagram metrics update complete')
}
