import { Router } from 'express'
import { config } from '../../config.js'
import { createLogger } from '../../lib/logger.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { Feed } from 'feed'
import { StoryStatus } from '@prisma/client'
import * as storyService from '../../services/story.js'
import * as issueService from '../../services/issue.js'
import prisma from '../../lib/prisma.js'

const router = Router()
const log = createLogger('feed')

const feedCache = new TTLCache<string>(config.feed.cacheMaxAge * 1000)

function getSiteUrl(): string {
  return config.siteUrl
}

function buildFeed(options: { title: string; description: string; feedPath: string }) {
  const siteUrl = getSiteUrl()
  return new Feed({
    title: options.title,
    description: options.description,
    id: siteUrl,
    link: siteUrl,
    language: 'es',
    copyright: `© ${new Date().getFullYear()} Voces Indígenas`,
    author: { name: 'Voces Indígenas', link: siteUrl },
    feedLinks: {
      rss: `${siteUrl}${options.feedPath}`,
    },
  })
}

function setRssHeaders(res: import('express').Response) {
  res.set('Content-Type', 'application/rss+xml; charset=utf-8')
  res.set('Cache-Control', `public, max-age=${config.feed.cacheMaxAge}`)
}

// Global feed — all published stories
router.get('/', async (_req, res) => {
  try {
    const xml = await cached(feedCache, 'feed:global', async () => {
      const result = await storyService.getPublishedStories({ page: 1, pageSize: config.feed.size })
      const siteUrl = getSiteUrl()

      const feed = buildFeed({
        title: 'Voces Indígenas',
        description: 'Noticias que importan a los pueblos indígenas. Curadas con cuidado por IA.',
        feedPath: '/api/feed',
      })

      for (const story of result.data) {
        feed.addItem({
          title: story.title || story.sourceTitle,
          id: story.id,
          link: `${siteUrl}/stories/${story.slug || story.id}`,
          description: story.summary || undefined,
          date: story.datePublished ? new Date(story.datePublished) : new Date(story.dateCrawled),
          category: [{ name: (story.issue ?? story.feed?.issue)?.name || 'General' }],
          author: [{ name: 'Voces Indígenas', link: getSiteUrl() }],
          ...(story.imageUrl ? { image: story.imageUrl } : {}),
        })
      }

      return feed.rss2()
    })

    setRssHeaders(res)
    res.send(xml)
  } catch (err) {
    log.error({ err }, 'failed to generate global RSS feed')
    res.status(500).json({ error: 'Failed to generate feed' })
  }
})

// Per-community feed — must come before /:issueSlug to avoid slug conflict
router.get('/comunidad/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; description: string | null; issue_ids: string[]; keywords: string[] }>>`
      SELECT id, name, description, issue_ids, keywords FROM communities WHERE slug = ${slug} AND active = true LIMIT 1
    `
    if (!rows.length) {
      res.status(404).json({ error: 'Community not found' })
      return
    }
    const community = rows[0]

    const xml = await cached(feedCache, `feed:community:${slug}`, async () => {
      const keywords: string[] = community.keywords ?? []
      const keywordFilter = keywords.length > 0
        ? {
            OR: keywords.flatMap((kw: string) => [
              { title: { contains: kw, mode: 'insensitive' as const } },
              { summary: { contains: kw, mode: 'insensitive' as const } },
            ]),
          }
        : {}

      const stories = await prisma.story.findMany({
        where: {
          status: StoryStatus.published,
          issueId: { in: community.issue_ids },
          relevance: { gte: 3 },
          ...keywordFilter,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          sourceTitle: true,
          summary: true,
          datePublished: true,
          dateCrawled: true,
          issue: { select: { name: true } },
        },
        orderBy: { datePublished: 'desc' },
        take: config.feed.size,
      })

      const siteUrl = getSiteUrl()
      const feed = buildFeed({
        title: `Voces Indígenas — ${community.name}`,
        description: community.description || `Noticias de ${community.name} curadas por Voces Indígenas.`,
        feedPath: `/api/feed/comunidad/${slug}`,
      })

      for (const story of stories) {
        feed.addItem({
          title: story.title || story.sourceTitle,
          id: story.id,
          link: `${siteUrl}/stories/${story.slug || story.id}`,
          description: story.summary || undefined,
          date: story.datePublished ? new Date(story.datePublished) : new Date(story.dateCrawled),
          category: [{ name: story.issue?.name || 'General' }],
          author: [{ name: 'Voces Indígenas', link: getSiteUrl() }],
        })
      }

      return feed.rss2()
    })

    setRssHeaders(res)
    res.send(xml)
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to generate community RSS feed')
    res.status(500).json({ error: 'Failed to generate feed' })
  }
})

// Per-issue feed
router.get('/:issueSlug', async (req, res) => {
  try {
    const { issueSlug } = req.params
    const issue = await issueService.getIssueBySlug(issueSlug)
    if (!issue) {
      res.status(404).json({ error: 'Issue not found' })
      return
    }

    const xml = await cached(feedCache, `feed:issue:${issueSlug}`, async () => {
      const result = await storyService.getPublishedStories({
        page: 1,
        pageSize: config.feed.size,
        issueSlug,
      })
      const siteUrl = getSiteUrl()

      const feed = buildFeed({
        title: `Voces Indígenas — ${issue.name}`,
        description: issue.description || `Noticias sobre ${issue.name} curadas por Voces Indígenas.`,
        feedPath: `/api/feed/${issueSlug}`,
      })

      for (const story of result.data) {
        feed.addItem({
          title: story.title || story.sourceTitle,
          id: story.id,
          link: `${siteUrl}/stories/${story.slug || story.id}`,
          description: story.summary || undefined,
          date: story.datePublished ? new Date(story.datePublished) : new Date(story.dateCrawled),
          category: [{ name: (story.issue ?? story.feed?.issue)?.name || 'General' }],
        })
      }

      return feed.rss2()
    })

    setRssHeaders(res)
    res.send(xml)
  } catch (err) {
    log.error({ err }, 'failed to generate issue RSS feed')
    res.status(500).json({ error: 'Failed to generate feed' })
  }
})

export default router
