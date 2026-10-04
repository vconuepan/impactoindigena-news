/**
 * Open Data API — public, rate-limited, no auth required.
 *
 * Designed for researchers, journalists, and NGOs who want to use
 * Voces Indígenas data in their work. Data is published under CC BY 4.0.
 *
 * Rate limit: 100 requests / hour per client (plus the general API limit).
 *
 * Hasta el 4-oct-2026 habia un nivel «institucional» de 1.000 solicitudes por
 * hora con token Bearer. Se retiro: no habia ningun token emitido (la variable
 * OPENDATA_API_TOKENS no existia en produccion) y, aunque lo hubiera, el
 * apiLimiter general (100 cada 15 min) cortaba antes de llegar a 1.000.
 *
 * Los filtros reutilizan las reglas del resto del sitio en vez de copiarlas:
 * - topic: buildIssueCondition, la misma de /api/stories (subtemas, el slug
 *   legado y las secciones geograficas por pais).
 * - community: publicCommunityWhere, el UNICO lugar que decide que notas
 *   muestra una vertical (lib/communityVisibility.ts). Sin esto, una nota que
 *   una persona retuvo en una vertical seguia saliendo por los datos abiertos.
 */
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'
import { config } from '../../config.js'
import { buildIssueCondition } from '../../services/story.js'
import { getReviewMode, publicCommunityWhere, temasVivos } from '../../lib/communityVisibility.js'

const router = Router()
const log = createLogger('public:opendata')

export const OPENDATA_LICENSE = 'CC-BY-4.0'
export const OPENDATA_ATTRIBUTION =
  'Datos de Voces Indígenas (vocesindigenas.org), un programa de la Fundación KM. Licencia CC BY 4.0: ' +
  'reutilización libre, también comercial, con atribución. Cite como: Voces Indígenas, Open Data API, ' +
  'https://vocesindigenas.org/opendata'

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const openDataLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded: 100 requests/hour. See /opendata#limites.' },
})

// ─── Query schema ─────────────────────────────────────────────────────────────

const openDataQuerySchema = z.object({
  topic: z.string().optional(),          // issue slug, e.g. "derechos-indigenas"
  community: z.string().optional(),      // community slug
  since: z.string().optional(),          // ISO 8601 date, e.g. "2025-01-01"
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
})

// ─── GET /api/opendata/stories ────────────────────────────────────────────────

router.get('/stories', openDataLimiter, async (req, res) => {
  const parsed = openDataQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors })
    return
  }

  const { topic, community, since, page, limit } = parsed.data

  try {
    // Cada filtro es una condicion independiente y se combinan con AND: asi
    // topic y community no se pisan aunque los dos traigan su propio OR.
    const conditions: Prisma.StoryWhereInput[] = [{ status: 'published', slug: { not: null } }]

    if (topic) {
      conditions.push(buildIssueCondition(topic))
    }

    if (community) {
      const comm = await prisma.community.findFirst({
        where: { slug: community, active: true },
        select: { id: true, keywords: true, issueIds: true },
      })
      if (!comm) {
        res.status(404).json({ error: `Community not found: ${community}` })
        return
      }
      conditions.push(publicCommunityWhere({
        community: comm,
        temas: await temasVivos(),
        mode: await getReviewMode(comm.id),
        learningMode: config.gate.learningMode,
      }))
    }

    if (since) {
      const sinceDate = new Date(since)
      if (isNaN(sinceDate.getTime())) {
        res.status(400).json({ error: 'Invalid "since" date. Use ISO 8601 format, e.g. "2025-01-01".' })
        return
      }
      conditions.push({ datePublished: { gte: sinceDate } })
    }

    const where: Prisma.StoryWhereInput = { AND: conditions }

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

    log.info({ topic, community, since, page, limit, total }, 'opendata query')

    res.set('Cache-Control', 'public, max-age=300')
    res.json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      license: OPENDATA_LICENSE,
      attribution: OPENDATA_ATTRIBUTION,
    })
  } catch (err) {
    log.error({ err }, 'opendata query failed')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
