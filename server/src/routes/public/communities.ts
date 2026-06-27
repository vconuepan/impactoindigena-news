import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import prisma from '../../lib/prisma.js'
import { StoryStatus } from '@prisma/client'
import { config } from '../../config.js'
import { requireMember } from '../../middleware/auth.js'
import { sendTransactional } from '../../services/brevo.js'

const router = Router()
const log = createLogger('public:communities')

const PUBLIC_STORY_SELECT = {
  id: true,
  slug: true,
  sourceUrl: true,
  sourceTitle: true,
  title: true,
  titleLabel: true,
  datePublished: true,
  relevance: true,
  emotionTag: true,
  summary: true,
  quote: true,
  quoteAttribution: true,
  marketingBlurb: true,
  relevanceSummary: true,
  imageUrl: true,
  titleEn: true,
  titleLabelEn: true,
  summaryEn: true,
  quoteEn: true,
  marketingBlurbEn: true,
  relevanceSummaryEn: true,
  clusterId: true,
  issue: { select: { name: true, slug: true } },
  feed: {
    select: {
      id: true,
      title: true,
      displayTitle: true,
      issue: { select: { name: true, slug: true } },
    },
  },
}

// GET /api/communities — list active communities
router.get('/', async (_req, res) => {
  try {
    const communities = await prisma.community.findMany({
      where: { active: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.set('Cache-Control', 'public, max-age=300')
    res.json(communities)
  } catch (err) {
    log.error({ err }, 'failed to fetch communities')
    res.status(500).json({ error: 'Failed to fetch communities' })
  }
})

// GET /api/communities/:slug — single community metadata (active only)
router.get('/:slug', async (req, res) => {
  try {
    const community = await prisma.community.findFirst({
      where: { slug: req.params.slug, active: true },
      include: { _count: { select: { members: true } } },
    })
    if (!community) {
      res.status(404).json({ error: 'Community not found' })
      return
    }
    res.set('Cache-Control', 'public, max-age=300')
    const { _count, ...rest } = community
    res.json({ ...rest, memberCount: _count.members })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch community')
    res.status(500).json({ error: 'Failed to fetch community' })
  }
})

// GET /api/communities/:slug/stories?page=1&pageSize=20
router.get('/:slug/stories', async (req, res) => {
  try {
    // Use raw query so keywords column works before db:generate is re-run
    const rows = await prisma.$queryRaw<Array<{ id: string; issue_ids: string[]; keywords: string[] }>>`
      SELECT id, issue_ids, keywords FROM communities WHERE slug = ${req.params.slug} LIMIT 1
    `
    if (!rows.length) {
      res.status(404).json({ error: 'Community not found' })
      return
    }
    const community = { id: rows[0].id, issueIds: rows[0].issue_ids, keywords: rows[0].keywords ?? [] }
    const keywords: string[] = community.keywords

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20))
    const minRelevance = 3

    const keywordFilter = keywords.length > 0
      ? {
          OR: keywords.flatMap((kw: string) => [
            { title: { contains: kw, mode: 'insensitive' as const } },
            { summary: { contains: kw, mode: 'insensitive' as const } },
            { sourceTitle: { contains: kw, mode: 'insensitive' as const } },
          ]),
        }
      : {}

    const where = {
      status: StoryStatus.published,
      issueId: { in: community.issueIds },
      relevance: { gte: minRelevance },
      ...keywordFilter,
    }

    const [total, stories] = await Promise.all([
      prisma.story.count({ where }),
      prisma.story.findMany({
        where,
        select: PUBLIC_STORY_SELECT,
        orderBy: { datePublished: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.set('Cache-Control', 'public, max-age=60')
    res.json({
      data: stories,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch community stories')
    res.status(500).json({ error: 'Failed to fetch community stories' })
  }
})

// GET /api/communities/:slug/signals?period=90d
// IRI signal feed — aggregated relevance data for this community.
// period: 7d | 30d | 90d | 365d (default: 90d). Only published stories, relevance >= 3.
router.get('/:slug/signals', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; type: string; region: string | null; issue_ids: string[]; keywords: string[] }>>`
      SELECT id, name, type, region, issue_ids, keywords FROM communities WHERE slug = ${req.params.slug} AND active = true LIMIT 1
    `
    if (!rows.length) {
      res.status(404).json({ error: 'Community not found' })
      return
    }

    const community = rows[0]
    const keywords: string[] = community.keywords ?? []
    const issueIds: string[] = community.issue_ids ?? []

    const VALID_PERIODS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
    const periodParam = (req.query.period as string) ?? '90d'
    const periodDays = VALID_PERIODS[periodParam] ?? 90
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
    const now7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const now30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const keywordFilter = keywords.length > 0
      ? {
          OR: keywords.flatMap((kw) => [
            { title: { contains: kw, mode: 'insensitive' as const } },
            { summary: { contains: kw, mode: 'insensitive' as const } },
            { sourceTitle: { contains: kw, mode: 'insensitive' as const } },
          ]),
        }
      : {}

    const baseWhere = {
      status: StoryStatus.published,
      issueId: { in: issueIds },
      relevance: { gte: 3 },
      ...keywordFilter,
    }

    const [
      allStories,
      count7d,
      count30d,
      byIssue,
      byEmotion,
      headlines,
    ] = await Promise.all([
      // All stories in period: id, relevance, issueId for aggregation
      prisma.story.findMany({
        where: { ...baseWhere, datePublished: { gte: periodStart } },
        select: { relevance: true, issueId: true, emotionTag: true },
      }),
      // Count last 7d
      prisma.story.count({ where: { ...baseWhere, datePublished: { gte: now7d } } }),
      // Count last 30d
      prisma.story.count({ where: { ...baseWhere, datePublished: { gte: now30d } } }),
      // Group by issueId
      prisma.story.groupBy({
        by: ['issueId'],
        where: { ...baseWhere, datePublished: { gte: periodStart } },
        _count: { _all: true },
      }),
      // Group by emotionTag
      prisma.story.groupBy({
        by: ['emotionTag'],
        where: { ...baseWhere, datePublished: { gte: periodStart } },
        _count: { _all: true },
      }),
      // Recent headlines
      prisma.story.findMany({
        where: { ...baseWhere, datePublished: { gte: periodStart } },
        select: {
          slug: true,
          title: true,
          datePublished: true,
          relevance: true,
          issue: { select: { slug: true, name: true } },
        },
        orderBy: { datePublished: 'desc' },
        take: 5,
      }),
    ])

    // Fetch issue metadata for topic breakdown
    const issueIdsSeen = [...new Set(byIssue.map((r) => r.issueId).filter(Boolean))] as string[]
    const issues = issueIdsSeen.length
      ? await prisma.issue.findMany({ where: { id: { in: issueIdsSeen } }, select: { id: true, slug: true, name: true } })
      : []
    const issueMap = new Map(issues.map((i) => [i.id, i]))

    // Aggregate relevance
    const relevances = allStories.map((s) => s.relevance ?? 0).filter((r) => r > 0)
    const avgRelevance = relevances.length > 0
      ? Math.round((relevances.reduce((a, b) => a + b, 0) / relevances.length) * 10) / 10
      : null

    const topics = byIssue
      .map((r) => {
        const issue = r.issueId ? issueMap.get(r.issueId) : null
        return { slug: issue?.slug ?? null, name: issue?.name ?? null, count: r._count._all }
      })
      .filter((t) => t.slug)
      .sort((a, b) => b.count - a.count)

    const emotionMap: Record<string, number> = {}
    for (const r of byEmotion) {
      const key = r.emotionTag ?? 'untagged'
      emotionMap[key] = r._count._all
    }

    res.set('Cache-Control', 'public, max-age=3600')
    res.json({
      community: {
        slug: req.params.slug,
        name: community.name,
        type: community.type,
        region: community.region,
      },
      period: periodParam,
      periodDays,
      coverage: {
        total: allStories.length,
        last7d: count7d,
        last30d: count30d,
      },
      relevance: {
        avg: avgRelevance,
        high: relevances.filter((r) => r >= 7).length,
        medium: relevances.filter((r) => r >= 4 && r < 7).length,
        low: relevances.filter((r) => r < 4).length,
      },
      topics,
      emotion: {
        uplifting: emotionMap['uplifting'] ?? 0,
        frustrating: emotionMap['frustrating'] ?? 0,
        scary: emotionMap['scary'] ?? 0,
        calm: emotionMap['calm'] ?? 0,
        untagged: emotionMap['untagged'] ?? 0,
      },
      recentHeadlines: headlines.map((h) => ({
        slug: h.slug,
        title: h.title,
        publishedAt: h.datePublished,
        relevance: h.relevance,
        issueSlug: h.issue?.slug ?? null,
      })),
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to fetch community signals')
    res.status(500).json({ error: 'Failed to fetch signals' })
  }
})

// GET /api/communities/:slug/membership — check if current user is a member
router.get('/:slug/membership', requireMember, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    })
    if (!community) {
      res.status(404).json({ error: 'Community not found' })
      return
    }

    const membership = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: req.user!.userId, communityId: community.id } },
    })
    res.json({ isMember: !!membership, consented: !!membership?.consentedAt })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to check membership')
    res.status(500).json({ error: 'Failed to check membership' })
  }
})

// POST /api/communities/:slug/join — join a community
router.post('/:slug/join', requireMember, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, slug: true, type: true, issueIds: true, keywords: true },
    })
    if (!community) {
      res.status(404).json({ error: 'Community not found' })
      return
    }

    // Check if membership already exists before upsert (to know if this is new)
    const existing = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: req.user!.userId, communityId: community.id } },
    })

    // Express consent gate for PUEBLO communities: membership reveals the
    // user's ethnic origin (sensitive data, Ley 21.719 Art. 16). Required for
    // new joins and to backfill legacy members who never consented.
    const consent = req.body?.consent === true
    const isPueblo = community.type === 'PUEBLO'
    const alreadyConsented = !!existing?.consentedAt
    if (isPueblo && !alreadyConsented && !consent) {
      res.status(400).json({ error: 'consent_required' })
      return
    }
    const consentData =
      isPueblo && consent
        ? { consentedAt: new Date(), consentVersion: config.community.consentVersion }
        : {}

    await prisma.communityMember.upsert({
      where: { userId_communityId: { userId: req.user!.userId, communityId: community.id } },
      update: consentData,
      create: { userId: req.user!.userId, communityId: community.id, ...consentData },
    })

    log.info({ userId: req.user!.userId, slug: req.params.slug }, 'user joined community')
    res.json({ isMember: true })

    // Fire-and-forget welcome email — only for new memberships
    if (!existing) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true, name: true },
      })
      if (user?.email) {
        sendWelcomeEmail(user.email, user.name, community).catch((err) =>
          log.error({ err, slug: req.params.slug }, 'failed to send welcome email')
        )
      }
    }
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to join community')
    res.status(500).json({ error: 'Failed to join community' })
  }
})

async function sendWelcomeEmail(
  email: string,
  userName: string,
  community: { name: string; slug: string; issueIds: string[]; keywords: string[] }
): Promise<void> {
  const SITE_URL = config.siteUrl || 'https://impactoindigena.news'
  const communityUrl = `${SITE_URL}/comunidad/${community.slug}`

  // Fetch the 3 most recent published stories for this community
  const keywords = community.keywords ?? []
  const keywordFilter =
    keywords.length > 0
      ? {
          OR: keywords.flatMap((kw) => [
            { title: { contains: kw, mode: 'insensitive' as const } },
            { summary: { contains: kw, mode: 'insensitive' as const } },
          ]),
        }
      : {}

  const stories = await prisma.story.findMany({
    where: {
      status: StoryStatus.published,
      issueId: { in: community.issueIds },
      ...keywordFilter,
    },
    select: { title: true, slug: true, summary: true, sourceTitle: true },
    orderBy: { datePublished: 'desc' },
    take: 3,
  })

  const firstName = userName && !userName.includes('@') ? userName.split(' ')[0] : null
  const greeting = firstName ? `Hola ${firstName}` : 'Hola'

  const storyRows = stories
    .map((s) => {
      const storyUrl = `${SITE_URL}/stories/${s.slug}`
      const title = s.title || s.slug
      const summary = s.summary ? s.summary.slice(0, 140) + (s.summary.length > 140 ? '…' : '') : ''
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0ede8;">
          ${s.sourceTitle ? `<p style="margin:0 0 4px;font-size:11px;color:#8c7e6a;font-family:sans-serif;">${s.sourceTitle}</p>` : ''}
          <a href="${storyUrl}" style="display:block;font-size:16px;font-weight:600;color:#1a1a1a;text-decoration:none;font-family:Georgia,serif;line-height:1.4;margin-bottom:4px;">${title}</a>
          ${summary ? `<p style="margin:0;font-size:13px;color:#4a4a4a;font-family:Georgia,serif;line-height:1.5;">${summary}</p>` : ''}
        </td>
      </tr>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f9f7f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

        <tr>
          <td style="background:#2d6a4f;padding:24px 32px;">
            <a href="${SITE_URL}" style="color:#ffffff;font-family:Georgia,serif;font-size:22px;font-weight:700;text-decoration:none;">Impacto Indígena</a>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 8px;font-size:16px;color:#333;font-family:Georgia,serif;line-height:1.6;">
              ${greeting}, te uniste a <a href="${communityUrl}" style="color:#2d6a4f;font-weight:700;text-decoration:none;">${community.name}</a>.
            </p>
            <p style="margin:0;font-size:14px;color:#555;font-family:sans-serif;line-height:1.6;">
              Cada lunes recibirás un resumen con las noticias más relevantes de esta comunidad.
            </p>
          </td>
        </tr>

        ${stories.length > 0 ? `
        <tr>
          <td style="padding:8px 32px 0;">
            <p style="margin:0 0 4px;font-size:12px;color:#8c7e6a;font-family:sans-serif;text-transform:uppercase;letter-spacing:1px;">Últimas noticias</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">${storyRows}</table>
          </td>
        </tr>` : ''}

        <tr>
          <td style="padding:0 32px 32px;">
            <a href="${communityUrl}" style="display:inline-block;background:#2d6a4f;color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">Ver comunidad →</a>
          </td>
        </tr>

        <tr>
          <td style="background:#f0ede8;padding:20px 32px;border-top:1px solid #e5e0d8;">
            <p style="margin:0 0 8px;font-size:12px;color:#8c7e6a;font-family:sans-serif;line-height:1.6;">
              Para salir de esta comunidad, visita su página y selecciona "Salir".
            </p>
            <p style="margin:0;font-size:12px;color:#8c7e6a;font-family:sans-serif;">
              ¿Algo que mejorar? <a href="${SITE_URL}/feedback" style="color:#2d6a4f;">Envíanos tu feedback</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  await sendTransactional({
    to: email,
    subject: `Bienvenido/a a ${community.name} — Impacto Indígena`,
    body: html,
  })
}

// DELETE /api/communities/:slug/leave — leave a community
router.delete('/:slug/leave', requireMember, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    })
    if (!community) {
      res.status(404).json({ error: 'Community not found' })
      return
    }

    await prisma.communityMember.deleteMany({
      where: { userId: req.user!.userId, communityId: community.id },
    })

    log.info({ userId: req.user!.userId, slug: req.params.slug }, 'user left community')
    res.json({ isMember: false })
  } catch (err) {
    log.error({ err, slug: req.params.slug }, 'failed to leave community')
    res.status(500).json({ error: 'Failed to leave community' })
  }
})

export default router
