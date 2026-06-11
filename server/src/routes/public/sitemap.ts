import { Router } from 'express'
import { config } from '../../config.js'
import { createLogger } from '../../lib/logger.js'
import { TTLCache, cached } from '../../lib/cache.js'
import prisma from '../../lib/prisma.js'

const router = Router()
const log = createLogger('sitemap')

export const sitemapCache = new TTLCache<string>(config.sitemap.cacheMaxAge * 1000)

function getSiteUrl(): string {
  return config.siteUrl
}

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

// Duplicated from client/src/routes.ts — server shouldn't import from client.
// When adding a new page, update both files.
const STATIC_ROUTES: { path: string; priority: number; changefreq: ChangeFreq }[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/issues', priority: 0.8, changefreq: 'monthly' },
  { path: '/comunidades', priority: 0.8, changefreq: 'weekly' },
  { path: '/methodology', priority: 0.7, changefreq: 'monthly' },
  { path: '/about', priority: 0.7, changefreq: 'monthly' },
  { path: '/newsletter', priority: 0.6, changefreq: 'monthly' },
  { path: '/feedback', priority: 0.5, changefreq: 'monthly' },
  { path: '/imprint', priority: 0.5, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.5, changefreq: 'yearly' },
  { path: '/search', priority: 0.3, changefreq: 'daily' },
  { path: '/saved', priority: 0.3, changefreq: 'daily' },
  { path: '/subscribed', priority: 0.2, changefreq: 'yearly' },
  { path: '/thank-you', priority: 0.2, changefreq: 'yearly' },
  // Guide pages — high-quality long-form content
  { path: '/guia', priority: 0.7, changefreq: 'monthly' },
  { path: '/guia/pueblo-mapuche', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/consulta-previa-fpic', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/pueblos-indigenas-chile', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/c169-pais-por-pais', priority: 0.8, changefreq: 'yearly' },
  { path: '/guia/jurisprudencia-interamericana', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/declaracion-onu-undrip', priority: 0.8, changefreq: 'yearly' },
  { path: '/glosario', priority: 0.7, changefreq: 'monthly' },
  { path: '/mapa', priority: 0.6, changefreq: 'monthly' },
  // Open Data API docs — for researchers and institutional users
  { path: '/opendata', priority: 0.6, changefreq: 'monthly' },
  // Distribution & developer tools — discoverable via search
  { path: '/widgets', priority: 0.6, changefreq: 'monthly' },
  { path: '/compare', priority: 0.6, changefreq: 'weekly' },
  { path: '/free-api', priority: 0.6, changefreq: 'monthly' },
  { path: '/news-fatigue', priority: 0.5, changefreq: 'monthly' },
  // Editorial contrast page — high SEO value, updated weekly
  { path: '/por-que-importa', priority: 0.7, changefreq: 'weekly' },
  { path: '/fuentes', priority: 0.6, changefreq: 'weekly' },
  { path: '/archivo', priority: 0.6, changefreq: 'weekly' },
  { path: '/casos', priority: 0.7, changefreq: 'weekly' },
  { path: '/alertas', priority: 0.6, changefreq: 'monthly' },
]

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function buildSitemapXml(
  baseUrl: string,
  stories: { slug: string; datePublished: Date | null }[],
  issues: { slug: string }[],
  communities: { slug: string }[],
): string {
  const staticUrls = STATIC_ROUTES.map(
    (route) => `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`
  )

  const issueUrls = issues.map((issue) => `  <url>
    <loc>${baseUrl}/issues/${issue.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)

  const communityUrls = communities.map((c) => `  <url>
    <loc>${baseUrl}/comunidad/${c.slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`)

  const storyUrls = stories.map((story) => {
    const lastmod = story.datePublished ? `\n    <lastmod>${formatDate(story.datePublished)}</lastmod>` : ''
    return `  <url>
    <loc>${baseUrl}/stories/${story.slug}</loc>${lastmod}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...issueUrls, ...communityUrls, ...storyUrls].join('\n')}
</urlset>
`
}

router.get('/', async (_req, res) => {
  try {
    const xml = await cached(sitemapCache, 'sitemap', async () => {
      const [stories, issues, communities] = await Promise.all([
        prisma.story.findMany({
          where: { status: 'published', slug: { not: null } },
          select: { slug: true, datePublished: true },
          orderBy: { datePublished: 'desc' },
        }),
        prisma.issue.findMany({
          select: { slug: true },
          orderBy: { name: 'asc' },
        }),
        prisma.community.findMany({
          select: { slug: true },
          orderBy: { name: 'asc' },
        }),
      ])

      log.info({ storyCount: stories.length, issueCount: issues.length, communityCount: communities.length }, 'generated sitemap')
      return buildSitemapXml(
        getSiteUrl(),
        stories as { slug: string; datePublished: Date | null }[],
        issues,
        communities,
      )
    })

    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('Cache-Control', `public, max-age=${config.sitemap.cacheMaxAge}`)
    res.send(xml)
  } catch (err) {
    log.error({ err }, 'failed to generate sitemap')
    res.status(500).json({ error: 'Failed to generate sitemap' })
  }
})

export default router
