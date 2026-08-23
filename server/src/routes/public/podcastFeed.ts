import { Router } from 'express'
import { config } from '../../config.js'
import { createLogger } from '../../lib/logger.js'
import { TTLCache, cached } from '../../lib/cache.js'
import prisma from '../../lib/prisma.js'

const router = Router()
const log = createLogger('podcast-feed')
const feedCache = new TTLCache<string>(15 * 60 * 1000) // 15 min cache

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// GET /api/podcast/feed.xml — RSS feed compatible con Spotify, Apple Podcasts, etc.
router.get('/feed.xml', async (_req, res) => {
  try {
    const xml = await cached(feedCache, 'podcast:feed', async () => {
      const episodes = await prisma.podcast.findMany({
        where: { status: 'published', audioUrl: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      })

      const siteUrl = config.siteUrl
      const feedUrl = `${siteUrl}/podcast/feed.xml`
      const now = new Date().toUTCString()

      const items = episodes.map(ep => {
        const pubDate = ep.publishedAt
          ? new Date(ep.publishedAt).toUTCString()
          : new Date(ep.createdAt).toUTCString()
        const duration = ep.duration
          ? `${Math.floor(ep.duration / 60)}:${String(ep.duration % 60).padStart(2, '0')}`
          : '0:00'
        const title = escapeXml(ep.title)
        const description = escapeXml(ep.description || ep.title)
        const guid = `${siteUrl}/podcast/${ep.id}`

        return `
    <item>
      <title>${title}</title>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <link>${guid}</link>
      <enclosure url="${ep.audioUrl}" type="audio/mpeg" length="${ep.duration ? ep.duration * 16000 : 0}" />
      <itunes:title>${title}</itunes:title>
      <itunes:summary>${description}</itunes:summary>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      ${ep.episodeNumber ? `<itunes:episode>${ep.episodeNumber}</itunes:episode>` : ''}
    </item>`
      }).join('\n')

      return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Voces Indígenas</title>
    <description>Las noticias más importantes sobre pueblos indígenas del mundo y de Chile, curadas con inteligencia artificial.</description>
    <link>${siteUrl}</link>
    <language>es</language>
    <copyright>© ${new Date().getFullYear()} Voces Indígenas</copyright>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <itunes:title>Voces Indígenas</itunes:title>
    <itunes:author>Voces Indígenas</itunes:author>
    <itunes:summary>Las noticias más importantes sobre pueblos indígenas del mundo y de Chile, curadas con inteligencia artificial.</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:language>es</itunes:language>
    <itunes:category text="News" />
    <itunes:category text="Society &amp; Culture">
      <itunes:category text="Documentary" />
    </itunes:category>
    <itunes:owner>
      <itunes:name>Voces Indígenas</itunes:name>
      <itunes:email>${process.env.BREVO_FROM_EMAIL || ''}</itunes:email>
    </itunes:owner>
${items}
  </channel>
</rss>`
    })

    res.set('Content-Type', 'application/rss+xml; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=900')
    res.send(xml)
  } catch (err) {
    log.error({ err }, 'failed to generate podcast RSS feed')
    res.status(500).json({ error: 'Failed to generate podcast feed' })
  }
})

export default router
