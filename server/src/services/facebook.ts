import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import {
  createPagePost,
  getPostMetrics,
  isFacebookConfigured,
  FacebookAuthError,
} from '../lib/facebook.js'
import { getMediumLLM, rateLimitDelay } from './llm.js'
import { buildFacebookPostPrompt } from '../prompts/facebook.js'
import { config } from '../config.js'

const log = createLogger('facebook-service')

const facebookDraftSchema = z.object({
  postText: z.string().describe('The complete Facebook Page post text, ready to publish. No link, no hashtags.'),
})

const STORY_INCLUDE = { story: { include: { feed: true, issue: true } } }

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

  // Un borrador existente se devuelve tal cual para que el panel reabra sin
  // sobresaltos; un fallido se descarta y se regenera; un publicado bloquea.
  const existingPost = await prisma.facebookPost.findFirst({
    where: { storyId },
    include: STORY_INCLUDE,
  })
  if (existingPost) {
    if (existingPost.status === 'draft') return existingPost
    if (existingPost.status === 'failed') {
      await prisma.facebookPost.delete({ where: { id: existingPost.id } })
    } else {
      throw new Error('Story already has a Facebook post')
    }
  }

  await rateLimitDelay()
  const llm = getMediumLLM()
  const structuredLlm = llm.withStructuredOutput(facebookDraftSchema, { method: 'functionCalling' })

  const prompt = buildFacebookPostPrompt({
    title: story.title,
    titleLabel: story.titleLabel,
    summary: story.summary,
    relevanceSummary: story.relevanceSummary,
    relevanceReasons: story.relevanceReasons,
    marketingBlurb: story.marketingBlurb,
    issueName: story.issue?.name ?? null,
    sourceCountry: story.feed?.url ?? null,
  })

  const result = await structuredLlm.invoke([new HumanMessage(prompt)])

  const post = await prisma.facebookPost.create({
    data: { storyId, postText: result.postText, status: 'draft' },
    include: STORY_INCLUDE,
  })

  log.info({ postId: post.id, storyId }, 'Facebook draft generated via LLM')
  return post
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

/**
 * Acepta `draft` y `failed`, exactamente lo mismo que `publishPost`. El panel
 * guarda el texto antes de publicar, así que rechazar la edición de un fallido
 * lo dejaría impublicable — el bug que costó Instagram el 30-jul y LinkedIn el
 * 1-ago de 2026.
 */
export async function updateDraft(postId: string, postText: string) {
  const post = await prisma.facebookPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft' && post.status !== 'failed') {
    throw new Error('Can only edit draft posts')
  }

  return prisma.facebookPost.update({
    where: { id: postId },
    data: { postText },
    include: STORY_INCLUDE,
  })
}

/**
 * Borra solo el registro local. La publicación sigue en la Página: el token
 * cubre publicar y leer métricas, no borrar. Liberar la historia permite
 * generar un borrador nuevo.
 */
export async function deletePostRecord(postId: string) {
  const post = await prisma.facebookPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  await prisma.facebookPost.delete({ where: { id: postId } })
  log.info({ postId, status: post.status }, 'deleted Facebook post record')
}

export async function listPosts(options: { status?: string; page?: number; limit?: number }) {
  const { status, page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [posts, total] = await Promise.all([
    prisma.facebookPost.findMany({
      where,
      include: { story: { include: { issue: true, feed: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.facebookPost.count({ where }),
  ])

  return { posts, total, page, limit }
}

export async function getPostById(postId: string) {
  return prisma.facebookPost.findUnique({
    where: { id: postId },
    include: { story: { include: { issue: true, feed: true } } },
  })
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishPost(postId: string) {
  if (!isFacebookConfigured()) {
    throw new Error('Facebook credentials not configured')
  }

  const post = await prisma.facebookPost.findUnique({
    where: { id: postId },
    include: { story: true },
  })

  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft' && post.status !== 'failed') {
    throw new Error('Can only publish draft posts')
  }

  const storyUrl = `${config.siteUrl}/stories/${post.story.slug}`

  try {
    const result = await createPagePost(post.postText, storyUrl)

    const updated = await prisma.facebookPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        facebookPostId: result.id,
        permalink: result.permalink,
        publishedAt: new Date(),
        error: null,
      },
      include: STORY_INCLUDE,
    })

    log.info({ postId, facebookPostId: result.id }, 'Facebook post published')
    return updated
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.facebookPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish Facebook post')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function updateMetrics() {
  if (!isFacebookConfigured()) {
    log.warn('Facebook not configured, skipping metrics update')
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - config.facebook.metrics.maxAgeDays)

  const posts = await prisma.facebookPost.findMany({
    where: {
      status: 'published',
      facebookPostId: { not: null },
      publishedAt: { gte: cutoff },
    },
  })

  if (posts.length === 0) {
    log.info('no published posts to update metrics for')
    return
  }

  log.info({ postCount: posts.length }, 'updating Facebook engagement metrics')

  let updated = 0
  let failed = 0

  for (const post of posts) {
    try {
      const metrics = await getPostMetrics(post.facebookPostId!)
      await prisma.facebookPost.update({
        where: { id: post.id },
        data: {
          likeCount: metrics.likeCount,
          commentCount: metrics.commentCount,
          shareCount: metrics.shareCount,
          metricsUpdatedAt: new Date(),
        },
      })
      updated++
    } catch (err) {
      // Si el token murió, ningún post va a funcionar: cortar y propagar para
      // que el scheduler alerte. Tragarse el error post por post es lo que dejó
      // Instagram 12 días caído en silencio.
      if (err instanceof FacebookAuthError) {
        log.error({ err, updated, remaining: posts.length - updated }, 'Facebook token rejected, aborting metrics update')
        throw err
      }
      log.warn({ err, postId: post.id, facebookPostId: post.facebookPostId }, 'failed to update metrics for post')
      failed++
    }
  }

  log.info({ updated, failed }, 'Facebook metrics update complete')
}
