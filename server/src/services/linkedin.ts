import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { createUgcPost, getOrgPostMetrics, isLinkedInConfigured, LinkedInAuthError } from '../lib/linkedin.js'
import { getMediumLLM, rateLimitDelay } from './llm.js'
import { buildLinkedInPostPrompt } from '../prompts/linkedin.js'
import { withAiLabel } from '../lib/ai-label.js'
import { buildStoryCarouselForSocial, subirCarrusel, armadoDesdeElOriginal, StoryCarouselError } from './storyCarousel.js'
import { config } from '../config.js'

const log = createLogger('linkedin-service')

const linkedInDraftSchema = z.object({
  postText: z.string().describe('The complete LinkedIn post text, ready to publish. Includes body and hashtags.'),
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

  // If a draft already exists, return it so the panel reopens seamlessly.
  // If it failed, delete it and regenerate. Published posts block re-generation.
  const existingPost = await prisma.linkedInPost.findFirst({
    where: { storyId },
    include: { story: { include: { feed: true, issue: true } } },
  })
  if (existingPost) {
    if (existingPost.status === 'draft') return existingPost
    if (existingPost.status === 'failed') {
      await prisma.linkedInPost.delete({ where: { id: existingPost.id } })
    } else {
      throw new Error('Story already has a LinkedIn post')
    }
  }

  await rateLimitDelay()
  const llm = getMediumLLM()
  const structuredLlm = llm.withStructuredOutput(linkedInDraftSchema, { method: 'functionCalling' })

  const prompt = buildLinkedInPostPrompt({
    title: story.title,
    titleLabel: story.titleLabel,
    summary: story.summary,
    relevanceSummary: story.relevanceSummary,
    relevanceReasons: story.relevanceReasons,
    marketingBlurb: story.marketingBlurb,
    issueName: story.issue?.name ?? null,
    sourceCountry: story.feed?.url ?? null,
  })

  // The text and the carousel slides go in parallel: the carousel makes its own
  // model call, and this request is synchronous (the panel waits on it).
  const [result, slideUrls] = await Promise.all([
    structuredLlm.invoke([new HumanMessage(prompt)]),
    buildCarouselSlides(story),
  ])

  const rawPostText = result.postText.length > 2900
    ? result.postText.slice(0, 2897) + '…'
    : result.postText

  const post = await prisma.linkedInPost.create({
    data: {
      storyId,
      postText: rawPostText,
      slideUrls,
      status: 'draft',
    },
    include: { story: { include: { feed: true, issue: true } } },
  })

  log.info({ postId: post.id, storyId, slideCount: slideUrls.length }, 'LinkedIn draft generated via LLM')
  return post
}

/**
 * Las láminas de la galería de LinkedIn: el carrusel armado desde el artículo
 * original, el mismo de Instagram (decisión del director, 25-oct-2026). Se
 * reutiliza el de Instagram si ya existe; si no, se arma con los mismos
 * candados. Si no los pasa, LinkedIn sale sin galería (imagen única o tarjeta
 * del artículo), nunca con el carrusel anterior, que se armaba con el resumen
 * y las razones de la IA de Voces.
 */
async function buildCarouselSlides(story: { id: string }): Promise<string[]> {
  try {
    const igPost = await prisma.instagramPost.findUnique({ where: { storyId: story.id } })
    if (igPost && armadoDesdeElOriginal(igPost.slideUrls)) {
      log.info({ storyId: story.id, slideCount: igPost.slideUrls.length }, 'reusing Instagram carousel slides for LinkedIn')
      return igPost.slideUrls
    }
    const carrusel = await buildStoryCarouselForSocial(story.id)
    return await subirCarrusel(story.id, carrusel.imagenes)
  } catch (err) {
    if (err instanceof StoryCarouselError) {
      log.info({ storyId: story.id, motivo: err.message, avisos: err.avisos.length }, 'carousel did not pass the guards — LinkedIn post goes without gallery')
      return []
    }
    log.warn({ err, storyId: story.id }, 'failed to build LinkedIn carousel slides — will fall back at publish time')
    return []
  }
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

export async function updateDraft(postId: string, postText: string) {
  const post = await prisma.linkedInPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  // Igual que en Instagram: publishPost acepta 'failed' para reintentar, así que
  // editar también debe aceptarlo o el panel muere en 400 antes de publicar.
  if (post.status !== 'draft' && post.status !== 'failed') {
    throw new Error('Can only edit draft posts')
  }

  return prisma.linkedInPost.update({
    where: { id: postId },
    data: { postText },
    include: { story: { include: { feed: true, issue: true } } },
  })
}

export async function deletePostRecord(postId: string) {
  const post = await prisma.linkedInPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  await prisma.linkedInPost.delete({ where: { id: postId } })
  log.info({ postId, status: post.status }, 'deleted LinkedIn post record')
}

export async function listPosts(options: { status?: string; page?: number; limit?: number }) {
  const { status, page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [posts, total] = await Promise.all([
    prisma.linkedInPost.findMany({
      where,
      include: { story: { include: { issue: true, feed: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.linkedInPost.count({ where }),
  ])

  return { posts, total, page, limit }
}

export async function getPostById(postId: string) {
  return prisma.linkedInPost.findUnique({
    where: { id: postId },
    include: { story: { include: { issue: true, feed: true } } },
  })
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishPost(postId: string) {
  if (!isLinkedInConfigured()) {
    throw new Error('LinkedIn credentials not configured')
  }

  const post = await prisma.linkedInPost.findUnique({
    where: { id: postId },
    include: { story: true },
  })

  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft' && post.status !== 'failed') throw new Error('Can only publish draft posts')

  const story = post.story
  const storyUrl = `https://vocesindigenas.org/stories/${story.slug}`

  // Prefer the carousel slides (multi-image gallery). Fall back to the
  // story's single image, then to an article link card. A gallery from the
  // previous generator (AI summary) is never published: a draft saved before
  // 25-oct-2026 goes out without it.
  const imageUrls = armadoDesdeElOriginal(post.slideUrls)
    ? post.slideUrls
    : (story.imageUrl ? [story.imageUrl] : [])

  try {
    // 3000: tope de caracteres del texto de un post en LinkedIn.
    const result = await createUgcPost(
      withAiLabel(post.postText, 3000),
      storyUrl,
      story.title ?? story.sourceTitle,
      story.summary || '',
      imageUrls,
    )

    const updated = await prisma.linkedInPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        linkedinPostId: result.id,
        postUrl: result.permalink,
        publishedAt: new Date(),
      },
      include: { story: { include: { feed: true, issue: true } } },
    })

    log.info({ postId, linkedinPostId: result.id }, 'LinkedIn post published')
    return updated
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.linkedInPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish LinkedIn post')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Update engagement metrics for all recent published posts.
 * Only fetches metrics when authorUrn is an organization account.
 */
export async function updateMetrics() {
  if (!isLinkedInConfigured()) {
    log.warn('LinkedIn not configured, skipping metrics update')
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - config.linkedin.metrics.maxAgeDays)

  const posts = await prisma.linkedInPost.findMany({
    where: {
      status: 'published',
      linkedinPostId: { not: null },
      publishedAt: { gte: cutoff },
    },
  })

  if (posts.length === 0) {
    log.info('no published posts to update metrics for')
    return
  }

  log.info({ postCount: posts.length }, 'updating LinkedIn engagement metrics')

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const post of posts) {
    try {
      const metrics = await getOrgPostMetrics(post.linkedinPostId!, config.linkedin.authorUrn)
      if (!metrics) {
        skipped++
        continue
      }
      await prisma.linkedInPost.update({
        where: { id: post.id },
        data: {
          likeCount: metrics.likeCount,
          commentCount: metrics.commentCount,
          impressionCount: metrics.impressionCount,
          metricsUpdatedAt: new Date(),
        },
      })
      updated++
    } catch (err) {
      // Token muerto: no tiene sentido recorrer el resto de los posts, y sobre
      // todo el job NO debe terminar "OK". Sube para que el scheduler avise.
      if (err instanceof LinkedInAuthError) {
        log.error(
          { err, updated, skipped, failed, remaining: posts.length - (updated + skipped + failed) },
          'LinkedIn token rejected while updating metrics, aborting',
        )
        throw err
      }
      log.warn({ err, postId: post.id, linkedinPostId: post.linkedinPostId }, 'failed to update metrics for post')
      failed++
    }
  }

  log.info({ updated, skipped, failed }, 'LinkedIn metrics update complete')
}
