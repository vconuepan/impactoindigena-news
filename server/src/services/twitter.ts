import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { createTweet, getTweetMetrics, isTwitterConfigured } from '../lib/twitter.js'
import { generateStoryImage } from '../lib/imageGen.js'

const log = createLogger('twitter-service')

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
  const existingPost = await prisma.twitterPost.findFirst({
    where: { storyId },
  })
  if (existingPost) throw new Error('Story already has a Twitter post')

  // Reusar texto de Bluesky si existe
  const blueskyPost = await prisma.blueskyPost.findFirst({
    where: { storyId },
    orderBy: { createdAt: 'desc' },
  })

  const baseText = blueskyPost?.postText || story.marketingBlurb || story.summary || story.title || ''
  const storyUrl = `https://vocesindigenas.org/stories/${story.slug}`

  // Agregar link al final
  const textWithLink = `${baseText}\n\n${storyUrl}`
  const trimmed = textWithLink.length > 275
    ? baseText.slice(0, 235) + '…\n\n' + storyUrl
    : textWithLink

  // Generar imagen con DALL-E
  let imageUrl: string | null = null
  try {
    imageUrl = await generateStoryImage(
      storyId,
      story.title,
      story.summary || story.marketingBlurb || '',
    )
    log.info({ storyId, imageUrl }, 'image generated for Twitter post')
  } catch (err) {
    log.warn({ err, storyId }, 'failed to generate image, posting without image')
  }

  const post = await prisma.twitterPost.create({
    data: {
      storyId,
      postText: trimmed,
      imageUrl,
      status: 'draft',
    },
    include: { story: { include: { feed: true, issue: true } } },
  })

  log.info({ postId: post.id, storyId, textLength: trimmed.length, hasImage: !!imageUrl }, 'Twitter draft generated')
  return post
}

// ---------------------------------------------------------------------------
// Draft management
// ---------------------------------------------------------------------------

/**
 * Only `draft` is editable, matching what `publishPost` accepts. Keeping the
 * two in step is what Instagram and LinkedIn got wrong: the panel saves the
 * text before publishing, so a status that publish accepts but edit rejects
 * makes the post unpublishable from the UI.
 *
 * Recovery from `failed` here is delete-and-regenerate, same as Bluesky and
 * Mastodon.
 */
export async function updateDraft(postId: string, postText: string) {
  const post = await prisma.twitterPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft') throw new Error('Can only edit draft posts')

  return prisma.twitterPost.update({
    where: { id: postId },
    data: { postText },
    include: { story: { include: { feed: true, issue: true } } },
  })
}

/**
 * Drops the local record only. A published tweet stays up on Twitter, because
 * the API credentials here cover posting and metrics, not deletion. Deleting
 * the record frees the story to be drafted again.
 */
export async function deletePostRecord(postId: string) {
  const post = await prisma.twitterPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  await prisma.twitterPost.delete({ where: { id: postId } })
  log.info({ postId, status: post.status }, 'deleted Twitter post record')
}

export async function listPosts(options: { status?: string; page?: number; limit?: number }) {
  const { status, page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [posts, total] = await Promise.all([
    prisma.twitterPost.findMany({
      where,
      include: { story: { include: { issue: true, feed: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.twitterPost.count({ where }),
  ])

  return { posts, total, page, limit }
}

export async function getPostById(postId: string) {
  return prisma.twitterPost.findUnique({
    where: { id: postId },
    include: { story: { include: { issue: true, feed: true } } },
  })
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishPost(postId: string) {
  if (!isTwitterConfigured()) {
    throw new Error('Twitter credentials not configured')
  }

  const post = await prisma.twitterPost.findUnique({
    where: { id: postId },
    include: { story: true },
  })

  if (!post) throw new Error('Post not found')
  if (post.status !== 'draft') throw new Error('Can only publish draft posts')

  try {
    const result = await createTweet(post.postText, post.imageUrl ?? undefined)

    const updated = await prisma.twitterPost.update({
      where: { id: postId },
      data: {
        status: 'published',
        tweetId: result.id,
        tweetUrl: result.url,
        publishedAt: new Date(),
      },
      include: { story: { include: { feed: true, issue: true } } },
    })

    log.info({ postId, tweetId: result.id }, 'tweet published')
    return updated
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.twitterPost.update({
      where: { id: postId },
      data: { status: 'failed', error: errorMessage },
    })
    log.error({ err, postId }, 'failed to publish tweet')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function updateMetrics() {
  if (!isTwitterConfigured()) {
    log.warn('Twitter not configured, skipping metrics update')
    return
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const posts = await prisma.twitterPost.findMany({
    where: {
      status: 'published',
      tweetId: { not: null },
      publishedAt: { gte: cutoff },
    },
  })

  if (posts.length === 0) {
    log.info('no published tweets to update metrics for')
    return
  }

  log.info({ postCount: posts.length }, 'updating Twitter metrics')

  for (const post of posts) {
    try {
      const metrics = await getTweetMetrics(post.tweetId!)
      await prisma.twitterPost.update({
        where: { id: post.id },
        data: {
          likeCount: metrics.likeCount,
          retweetCount: metrics.retweetCount,
          replyCount: metrics.replyCount,
          quoteCount: metrics.quoteCount,
          metricsUpdatedAt: new Date(),
        },
      })
    } catch (err) {
      log.warn({ err, postId: post.id }, 'failed to update metrics for tweet')
    }
  }

  log.info('Twitter metrics update complete')
}
