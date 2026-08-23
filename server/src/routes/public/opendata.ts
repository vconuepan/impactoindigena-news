/**
 * Open Data API — public, rate-limited, no auth required.
 *
 * Designed for researchers, journalists, and NGOs who want to use
 * Voces Indígenas data in their work. When cited in papers or reports,
 * this API generates institutional backlinks that build domain authority.
 *
 * Rate limits:
 *   - Public tier (no token):       100 requests / hour / IP
 *   - Institutional tier (Bearer token): 1 000 requests / hour / IP
 *
 * Token management: tokens are stored as a comma-separated env var
 * OPENDATA_API_TOKENS. Generate with: openssl rand -hex 32
 */
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'
import { config } from '../../config.js'

const router = Router()
const log = createLogger('public:opendata')

// ─── Rate limiters ────────────────────────────────────────────────────────────

const publicOpenDataLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Public tier: 100 requests/hour. For higher limits, see /opendata#institutional.' },
})

const institutionalOpenDataLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Institutional tier: 1 000 requests/hour.' },
})

// ─── Token auth middleware ────────────────────────────────────────────────────

function getValidTokens(): Set<string> {
  const raw = process.env.OPENDATA_API_TOKENS ?? ''
  return new Set(raw.split(',').map(t => t.trim()).filter(Boolean))
}

function resolveRateLimiter(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'] ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    const validTokens = getValidTokens()
    if (validTokens.size > 0 && validTokens.has(token)) {
      req.openDataTier = 'institutional'
      return institutionalOpenDataLimiter(req, res, next)
    }
    // Invalid token → treat as public (don't reveal token existence)
  }
  req.openDataTier = 'public'
  return publicOpenDataLimiter(req, res, next)
}

// ─── Query schema ─────────────────────────────────────────────────────────────

const openDataQuerySchema = z.object({
  topic: z.string().optional(),          // issue slug, e.g. "derechos-indigenas"
  community: z.string().optional(),      // community slug
  since: z.string().optional(),          // ISO 8601 date, e.g. "2025-01-01"
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
})

// ─── GET /api/opendata/stories ────────────────────────────────────────────────

router.get('/stories', resolveRateLimiter, async (req, res) => {
  const parsed = openDataQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors })
    return
  }

  const { topic, community, since, page, limit } = parsed.data

  try {
    const where: any = { status: 'published', slug: { not: null } }

    if (topic) {
      where.issue = { slug: topic }
    }

    if (community) {
      // Stories that have at least one keyword matching a community's keywords
      const comm = await prisma.community.findUnique({
        where: { slug: community },
        select: { keywords: true, issueIds: true },
      })
      if (!comm) {
        res.status(404).json({ error: `Community not found: ${community}` })
        return
      }
      const conditions: any[] = []
      if (comm.keywords.length > 0) {
        conditions.push({
          OR: comm.keywords.map((kw: string) => ({
            OR: [
              { title: { contains: kw, mode: 'insensitive' } },
              { summary: { contains: kw, mode: 'insensitive' } },
            ],
          })),
        })
      }
      if (comm.issueIds.length > 0) {
        conditions.push({ issueId: { in: comm.issueIds } })
      }
      if (conditions.length > 0) {
        where.OR = conditions
      }
    }

    if (since) {
      const sinceDate = new Date(since)
      if (isNaN(sinceDate.getTime())) {
        res.status(400).json({ error: 'Invalid "since" date. Use ISO 8601 format, e.g. "2025-01-01".' })
        return
      }
      where.datePublished = { gte: sinceDate }
    }

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        select: {
          slug: true,
          title: true,
          sourceUrl: true,
          datePublished: true,
          summary: true,
          relevanceSummary: true,
          emotionTag: true,
          imageUrl: true,
          issue: { select: { name: true, slug: true } },
          feed: { select: { title: true } },
        },
        orderBy: { datePublished: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.story.count({ where }),
    ])

    const data = stories.map(s => ({
      title: s.title,
      url: `${config.siteUrl}/stories/${s.slug}`,
      sourceUrl: s.sourceUrl,
      publishedAt: s.datePublished,
      summary: s.summary,
      relevanceSummary: s.relevanceSummary,
      emotionTag: s.emotionTag,
      imageUrl: s.imageUrl ?? null,
      issue: s.issue ? { name: s.issue.name, slug: s.issue.slug } : null,
      source: s.feed?.title ?? null,
    }))

    log.info({ topic, community, since, page, limit, total, tier: (req as any).openDataTier }, 'opendata query')

    res.set('Cache-Control', 'public, max-age=300')
    res.json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      attribution: 'Datos de Voces Indígenas (vocesindigenas.org). Reutilización libre con atribución — cite como: Voces Indígenas, Open Data API, https://vocesindigenas.org/opendata',
    })
  } catch (err) {
    log.error({ err }, 'opendata query failed')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
