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

  // Prevenir posts duplicados
  const existingPost = await prisma.instagramPost.findFirst({
    where: { storyId },
  })
  if (existingPost) throw new Error('Story already has an Instagram post')

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
      // Usar imagen genérica de fallback de Impacto Indígena
      aiImageUrl = 'https://impactoindigena.com/wp-content/uploads/2025/04/cropped-logo-impacto-indigena_letras_blancas-1-scaled-1.png'
    }
  }

  // Determinar si R2 está configurado para poder generar el carrusel
  const r2Configured = Boolean(
    config.r2.endpoint && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.publicUrl,
  )

  let imageUrls: string[]

  if (r2Configured) {
    // Carrusel completo de 4 slides
    const slide2Text = story.summary || ''
    const slide3Text = story.relevanceReasons || ''
    const slides = await generateCarousel(
      storyId,
      story.title,
      slide2Text,
      slide3Text,
      storyUrl,
      aiImageUrl,
    )
    imageUrls = slides.sort((a, b) => a.order - b.order).map((s) => s.imageUrl)
    log.info({ storyId, slideCount: imageUrls.length }, 'carousel generated via R2')
  } else {
    // Sin R2: publicación de imagen sencilla con la imagen de portada
    log.info({ storyId }, 'R2 not configured — using single-image post')
    imageUrls = [aiImageUrl]
  }

  const post = await prisma.instagramPost.create({
    data: {
      storyId,
      caption: trimmedCaption,
      imageUrl: imageUrls[0],
      slideUrls: imageUrls,
      status: 'draft',
    },
    include: { story: { include: { feed: true, issue: true } } },
  })

  log.info({ postId: post.id, storyId, slideCount: imageUrls.length }, 'Instagram draft generated')
  return post
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
  if (post.status !== 'draft') throw new Error('Can only publish draft posts')

  const slideUrls: string[] = post.slideUrls?.length ? post.slideUrls : (post.imageUrl ? [post.imageUrl] : [])
  if (slideUrls.length === 0) throw new Error('No images available for this post')

  try {
    // Use carousel for multiple slides, single-image for one
    const result = slideUrls.length > 1
      ? await createCarouselPost(slideUrls, post.caption)
      : await createSingleImagePost(slideUrls[0], post.caption)

    const updated = await prisma.instagramPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        instagramPostId: result.id,
        permalink: result.permalink,
        publishedAt: new Date(),
      },
      include: { story: { include: { feed: true, issue: true } } },
    })

    log.info({ postId, instagramPostId: result.id, slideCount: slideUrls.length }, 'Instagram post published')
    return updated
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.instagramPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish Instagram post')
    throw err
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
