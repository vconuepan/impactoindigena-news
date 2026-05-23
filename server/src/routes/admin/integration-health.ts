import { Router } from 'express'
import prisma from '../../lib/prisma.js'

const router = Router()

/**
 * GET /api/admin/integration-health
 *
 * Returns a snapshot of integration health across feeds, social channels,
 * and newsletter — the data the admin dashboard shows in the Integration
 * Health panel so the founder can spot silent failures without checking
 * Render logs.
 */
router.get('/', async (_req, res) => {
  try {
    const now = new Date()
    const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // ── Feeds ──────────────────────────────────────────────────────────────
    const [totalActiveFeeds, crawledIn24h, feedsWithRecentError] = await Promise.all([
      prisma.feed.count({ where: { active: true } }),
      prisma.feed.count({ where: { active: true, lastCrawledAt: { gte: h24ago } } }),
      prisma.feed.findMany({
        where: {
          active: true,
          lastCrawlError: { not: null },
          lastCrawlErrorAt: { gte: h24ago },
        },
        select: {
          id: true,
          title: true,
          lastCrawlError: true,
          lastCrawlErrorAt: true,
        },
        orderBy: { lastCrawlErrorAt: 'desc' },
        take: 5,
      }),
    ])

    const mostRecentCrawl = await prisma.feed.findFirst({
      where: { active: true, lastCrawledAt: { not: null } },
      orderBy: { lastCrawledAt: 'desc' },
      select: { lastCrawledAt: true },
    })

    // ── Social channels ────────────────────────────────────────────────────
    const [lastBluesky, lastMastodon, lastInstagram, lastTwitter, lastLinkedin] = await Promise.all([
      prisma.blueskyPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { status: true, publishedAt: true, createdAt: true },
      }),
      prisma.mastodonPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { status: true, publishedAt: true, createdAt: true },
      }),
      prisma.instagramPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { status: true, publishedAt: true, createdAt: true },
      }),
      prisma.twitterPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { status: true, publishedAt: true, createdAt: true },
      }),
      prisma.linkedInPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { status: true, publishedAt: true, createdAt: true },
      }),
    ])

    // ── Newsletter ─────────────────────────────────────────────────────────
    const lastNewsletter = await prisma.newsletterSend.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { status: true, sentAt: true, createdAt: true },
    })

    res.json({
      feeds: {
        totalActive: totalActiveFeeds,
        crawledIn24h,
        staleFeedsCount: totalActiveFeeds - crawledIn24h,
        lastCrawledAt: mostRecentCrawl?.lastCrawledAt ?? null,
        recentErrors: feedsWithRecentError,
      },
      social: {
        bluesky: lastBluesky
          ? { status: lastBluesky.status, lastAt: lastBluesky.publishedAt ?? lastBluesky.createdAt }
          : null,
        mastodon: lastMastodon
          ? { status: lastMastodon.status, lastAt: lastMastodon.publishedAt ?? lastMastodon.createdAt }
          : null,
        instagram: lastInstagram
          ? { status: lastInstagram.status, lastAt: lastInstagram.publishedAt ?? lastInstagram.createdAt }
          : null,
        twitter: lastTwitter
          ? { status: lastTwitter.status, lastAt: lastTwitter.publishedAt ?? lastTwitter.createdAt }
          : null,
        linkedin: lastLinkedin
          ? { status: lastLinkedin.status, lastAt: lastLinkedin.publishedAt ?? lastLinkedin.createdAt }
          : null,
      },
      newsletter: lastNewsletter
        ? { status: lastNewsletter.status, lastAt: lastNewsletter.sentAt ?? lastNewsletter.createdAt }
        : null,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch integration health' })
  }
})

export default router
