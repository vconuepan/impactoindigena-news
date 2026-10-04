import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { fetchOgImage } from '../../lib/extract-og-image.js'
import { createLogger } from '../../lib/logger.js'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { Semaphore } from '../../lib/semaphore.js'
import { config } from '../../config.js'
import { registerCommunityReviews } from '../../services/communityReview.js'

const router = Router()
const log = createLogger('maintenance')

// GET /api/admin/maintenance/story-status?slug=...
// Check the actual DB status of a story by slug
router.get('/story-status', async (req, res) => {
  const slug = req.query.slug as string
  if (!slug) {
    res.status(400).json({ error: 'slug query param required' })
    return
  }
  const story = await prisma.story.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true, title: true, datePublished: true, clusterId: true },
  })
  if (!story) {
    res.json({ found: false, slug })
    return
  }
  res.json({ found: true, ...story })
})

// POST /api/admin/maintenance/republish-slug
// Force-republish a story by slug (set status = 'published')
router.post('/republish-slug', async (req, res) => {
  const { slug } = req.body as { slug?: string }
  if (!slug) {
    res.status(400).json({ error: 'slug required in body' })
    return
  }
  const story = await prisma.story.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true, title: true },
  })
  if (!story) {
    res.status(404).json({ error: 'Story not found', slug })
    return
  }
  const prevStatus = story.status
  await prisma.story.update({ where: { id: story.id }, data: { status: 'published' } })
  // Retencion por vertical (D4): este camino republica justo la clase de nota que
  // alguien habia despublicado; registra lo que dice el gate. Nunca lanza.
  await registerCommunityReviews([story.id])
  log.info({ slug, prevStatus }, 'force-republished story')
  res.json({ ok: true, slug, prevStatus, newStatus: 'published', title: story.title })
})

// POST /api/admin/maintenance/backfill-images
// One-time job: extract og:image from source articles for published stories
router.post('/backfill-images', async (req, res) => {
  const stories = await prisma.story.findMany({
    where: { status: 'published', imageUrl: null },
    select: { id: true, sourceUrl: true },
  })

  log.info({ total: stories.length }, 'starting image backfill')

  let updated = 0
  let skipped = 0

  await Promise.allSettled(
    stories.map(async (story) => {
      const imageUrl = await fetchOgImage(story.sourceUrl)
      if (imageUrl) {
        await prisma.story.update({ where: { id: story.id }, data: { imageUrl } })
        updated++
      } else {
        skipped++
      }
    }),
  )

  log.info({ updated, skipped }, 'image backfill complete')
  res.json({ total: stories.length, updated, skipped })
})

// POST /api/admin/maintenance/backfill-titles
// Rewrite titles+labels for stories published > 3 months ago (past tense, includes year if > 12 months)
// Runs in background — returns immediately with job status. Check server logs for progress.
router.post('/backfill-titles', async (req, res) => {
  const THREE_MONTHS_AGO = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)

  const stories = await prisma.story.findMany({
    where: {
      status: 'published',
      title: { not: null },
      sourceDatePublished: { lt: THREE_MONTHS_AGO },
    },
    select: { id: true, title: true, titleLabel: true, sourceDatePublished: true },
    orderBy: { sourceDatePublished: 'desc' },
  })

  log.info({ total: stories.length }, 'backfill-titles: starting background job')
  res.json({ ok: true, total: stories.length, message: 'Title rewrite started in background. Check server logs.' })

  // Run in background after response is sent
  setImmediate(async () => {
    const llm = new ChatOpenAI({
      model: config.llm.models.medium.name,
      reasoning: { effort: config.llm.models.medium.reasoningEffort },
      maxRetries: 3,
    })
    const rewriteSchema = z.object({
      titleLabel: z.string().describe('Ultra-short topic label (1-3 words, lowercase except proper nouns)'),
      title: z.string().describe('Standalone headline in PAST TENSE (max 10 words)'),
    })
    const structuredLlm = llm.withStructuredOutput(rewriteSchema)
    const semaphore = new Semaphore(6)

    let updated = 0
    let failed = 0

    await Promise.allSettled(
      stories.map((story) =>
        semaphore.run(async () => {
          try {
            const ageMonths = story.sourceDatePublished
              ? Math.floor((Date.now() - story.sourceDatePublished.getTime()) / (1000 * 60 * 60 * 24 * 30))
              : 0
            const publishedDate = story.sourceDatePublished?.toISOString().slice(0, 10) ?? 'unknown'
            const yearNote = ageMonths >= 12
              ? `- Si la noticia tiene más de 12 meses, incluye el año (${story.sourceDatePublished?.getFullYear()}) al inicio: ej. "En 2023, comunidad mapuche logró..."\n`
              : ''

            const result = await structuredLlm.invoke([
              new HumanMessage(
                `Esta noticia fue publicada el ${publishedDate} (hace ${ageMonths} meses). Reescribe el título y la etiqueta.\n\n` +
                  `REGLAS DEL LABEL (etiqueta):\n` +
                  `- 1-3 palabras. Frase nominal, sin conjunciones.\n` +
                  `- Minúsculas excepto nombres propios.\n` +
                  `- No repitas palabras del título.\n\n` +
                  `REGLAS DEL TÍTULO:\n` +
                  `- Máximo 10 palabras. Titular independiente.\n` +
                  `- TIEMPO PASADO: "logró", "aprobó", "firmó", "anunció", "rechazó", "denunció".\n` +
                  `- No uses presente ni futuro.\n` +
                  `- CONCRETO: actor + acción + impacto real para pueblos indígenas.\n` +
                  `- Evita títulos vagos ("mostró su trabajo") — ¿qué importa para los pueblos indígenas?\n` +
                  yearNote +
                  `\nLabel actual: "${story.titleLabel ?? ''}"\n` +
                  `Título actual: "${story.title ?? ''}"`,
              ),
            ])

            await prisma.story.update({
              where: { id: story.id },
              data: { title: result.title, titleLabel: result.titleLabel },
            })
            updated++
            log.info({ id: story.id, date: publishedDate, old: story.title, new: result.title }, 'backfill-titles: updated')
          } catch (err) {
            failed++
            log.error({ err, id: story.id, title: story.title }, 'backfill-titles: failed')
          }
        }),
      ),
    )

    log.info({ updated, failed, total: stories.length }, 'backfill-titles: complete')
  })
})

// POST /api/admin/maintenance/purge-trashed
// Permanently delete all trashed stories
router.post('/purge-trashed', async (_req, res) => {
  const { count } = await prisma.story.deleteMany({ where: { status: 'trashed' } })
  log.info({ count }, 'purged trashed stories')
  res.json({ ok: true, deleted: count })
})

// GET /api/admin/maintenance/feed-status
// Return all active feeds with last crawl info
router.get('/feed-status', async (_req, res) => {
  const feeds = await prisma.feed.findMany({
    where: { active: true },
    select: {
      id: true,
      title: true,
      rssUrl: true,
      lastCrawledAt: true,
      lastCrawlError: true,
      lastSuccessfulCrawlAt: true,
      consecutiveFailedCrawls: true,
      _count: { select: { stories: true } },
    },
    orderBy: { title: 'asc' },
  })
  res.json({ feeds, total: feeds.length })
})

// POST /api/admin/maintenance/backfill-slugs
// Generate slugs for published stories that have no slug
router.post('/backfill-slugs', async (_req, res) => {
  function toSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  }

  const stories = await prisma.story.findMany({
    where: { status: 'published', title: { not: null }, slug: null },
    select: { id: true, title: true },
    take: 500,
  })

  let updated = 0
  let skipped = 0

  await Promise.allSettled(
    stories.map(async (story) => {
      if (!story.title) { skipped++; return }
      const base = toSlug(story.title)
      if (!base) { skipped++; return }
      const slug = base + '-' + story.id.slice(0, 6)
      try {
        await prisma.story.update({ where: { id: story.id }, data: { slug } })
        updated++
      } catch {
        skipped++
      }
    }),
  )

  log.info({ total: stories.length, updated, skipped }, 'backfill-slugs complete')
  res.json({ ok: true, total: stories.length, updated, skipped })
})

// POST /api/admin/maintenance/backfill-images-by-feed
// Re-extract og:image for published stories in a specific feed that have no image
router.post('/backfill-images-by-feed', async (req, res) => {
  const { feedId } = req.body as { feedId?: string }
  if (!feedId) {
    res.status(400).json({ error: 'feedId required in body' })
    return
  }

  const stories = await prisma.story.findMany({
    where: { feedId, status: 'published', imageUrl: null },
    select: { id: true, sourceUrl: true },
  })

  log.info({ feedId, total: stories.length }, 'backfill-images-by-feed starting')
  res.json({ ok: true, total: stories.length, message: `Procesando ${stories.length} historias en background. Revisa los logs.` })

  setImmediate(async () => {
    let updated = 0
    let skipped = 0
    await Promise.allSettled(
      stories.map(async (story) => {
        const imageUrl = await fetchOgImage(story.sourceUrl)
        if (imageUrl) {
          await prisma.story.update({ where: { id: story.id }, data: { imageUrl } })
          updated++
        } else {
          skipped++
        }
      }),
    )
    log.info({ feedId, updated, skipped }, 'backfill-images-by-feed complete')
  })
})

export default router
