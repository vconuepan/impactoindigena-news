import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { sendTransactional } from '../services/brevo.js'
import { createLogger } from '../lib/logger.js'
import { StoryStatus } from '@prisma/client'

const log = createLogger('send_community_digest')

const SITE_URL = config.siteUrl || 'https://vocesindigenas.org'
const LOOKBACK_DAYS = 7

interface DigestStory {
  title: string | null
  slug: string
  summary: string | null
  sourceTitle: string | null
  datePublished: Date | null
}

interface DigestSection {
  community: { name: string; slug: string; type: string }
  stories: DigestStory[]
}

/**
 * Builds a responsive HTML email for a community digest.
 * One email per user; stories grouped by community.
 */
function buildDigestHtml(userName: string, sections: DigestSection[]): string {
  const communityRows = sections
    .map(({ community, stories }) => {
      const communityUrl = `${SITE_URL}/comunidad/${community.slug}`
      const typeLabel =
        community.type === 'PUEBLO'
          ? 'Pueblo'
          : community.type === 'TERRITORIO'
            ? 'Territorio'
            : 'Causa'

      const storyRows = stories
        .map((s) => {
          const storyUrl = `${SITE_URL}/stories/${s.slug}`
          const title = s.title || s.slug
          const summary = s.summary || ''
          const source = s.sourceTitle || ''
          const date = s.datePublished
            ? new Date(s.datePublished).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long',
              })
            : ''

          return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f0ede8;">
              <p style="margin:0 0 4px;font-size:11px;color:#8c7e6a;font-family:sans-serif;">${source}${date ? ` · ${date}` : ''}</p>
              <a href="${storyUrl}" style="display:block;font-size:17px;font-weight:600;color:#1a1a1a;text-decoration:none;font-family:Georgia,serif;line-height:1.4;margin-bottom:6px;">${title}</a>
              <p style="margin:0;font-size:14px;color:#4a4a4a;font-family:Georgia,serif;line-height:1.6;">${summary.slice(0, 180)}${summary.length > 180 ? '…' : ''}</p>
            </td>
          </tr>`
        })
        .join('')

      return `
      <tr>
        <td style="padding:28px 0 8px;">
          <p style="margin:0 0 2px;font-size:11px;color:#8c7e6a;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">${typeLabel}</p>
          <a href="${communityUrl}" style="font-size:20px;font-weight:700;color:#2d6a4f;text-decoration:none;font-family:Georgia,serif;">${community.name}</a>
          <p style="margin:4px 0 0;font-size:13px;color:#8c7e6a;font-family:sans-serif;">${stories.length} noticia${stories.length !== 1 ? 's' : ''} nueva${stories.length !== 1 ? 's' : ''} esta semana</p>
        </td>
      </tr>
      ${storyRows}
      `
    })
    .join('')

  const firstName = userName && !userName.includes('@')
    ? userName.split(' ')[0]
    : 'Hola'
  const greeting = firstName !== 'Hola' ? `Hola ${firstName}` : 'Hola'
  const communityCount = sections.length

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu resumen de comunidades — Voces Indígenas</title>
</head>
<body style="margin:0;padding:0;background:#f9f7f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

          <tr>
            <td style="background:#2d6a4f;padding:24px 32px;">
              <a href="${SITE_URL}" style="color:#ffffff;font-family:Georgia,serif;font-size:22px;font-weight:700;text-decoration:none;">Voces Indígenas</a>
              <p style="margin:4px 0 0;color:#a8d5be;font-size:13px;font-family:sans-serif;">Noticias de tus comunidades</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0;font-size:16px;color:#333;font-family:Georgia,serif;line-height:1.6;">
                ${greeting}, esta semana hubo novedades en ${communityCount === 1 ? 'tu comunidad' : 'tus comunidades'}.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${communityRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${SITE_URL}/comunidades" style="display:inline-block;background:#2d6a4f;color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">Ver todas las comunidades →</a>
            </td>
          </tr>

          <tr>
            <td style="background:#f0ede8;padding:20px 32px;border-top:1px solid #e5e0d8;">
              <p style="margin:0 0 8px;font-size:12px;color:#8c7e6a;font-family:sans-serif;line-height:1.6;">
                Recibes este correo porque te uniste a una o más comunidades en
                <a href="${SITE_URL}" style="color:#2d6a4f;">vocesindigenas.org</a>.
                Para gestionar tus preferencias de digest, visita <a href="${SITE_URL}/perfil" style="color:#2d6a4f;">tu perfil</a>.
              </p>
              <p style="margin:0;font-size:12px;color:#8c7e6a;font-family:sans-serif;">
                ¿Algo que mejorar? <a href="${SITE_URL}/feedback" style="color:#2d6a4f;">Envíanos tu feedback</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function runSendCommunityDigest(): Promise<void> {
  log.info('starting community digest job')

  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)

  const memberships = await prisma.communityMember.findMany({
    include: {
      user: { select: { id: true, email: true, name: true } },
      community: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          issueIds: true,
          keywords: true,
        },
      },
    },
  })

  if (memberships.length === 0) {
    log.info('no community members, skipping digest')
    return
  }

  // Group by userId → one email per user with all their communities
  const byUser = new Map<
    string,
    {
      user: { id: string; email: string; name: string }
      communities: Array<{
        id: string
        slug: string
        name: string
        type: string
        issueIds: string[]
        keywords: string[]
      }>
    }
  >()

  for (const m of memberships) {
    if (!byUser.has(m.user.id)) {
      byUser.set(m.user.id, { user: m.user, communities: [] })
    }
    byUser.get(m.user.id)!.communities.push({
      id: m.community.id,
      slug: m.community.slug,
      name: m.community.name,
      type: m.community.type as string,
      issueIds: m.community.issueIds as string[],
      keywords: (m.community.keywords ?? []) as string[],
    })
  }

  log.info({ userCount: byUser.size }, 'building digests')

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const { user, communities } of byUser.values()) {
    // Load digest exclusions for this user (communities they opted out of)
    const exclusions = await prisma.digestExclusion.findMany({
      where: { userId: user.id },
      select: { communityId: true },
    })
    const excludedIds = new Set(exclusions.map((e) => e.communityId))

    const sections: DigestSection[] = []

    for (const community of communities) {
      if (excludedIds.has(community.id)) continue
      const keywords = community.keywords

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
          datePublished: { gte: since },
          relevance: { gte: 3 },
          ...keywordFilter,
        },
        select: {
          title: true,
          slug: true,
          summary: true,
          sourceTitle: true,
          datePublished: true,
        },
        orderBy: { datePublished: 'desc' },
        take: 5,
      })

      if (stories.length > 0) {
        // slug is never null on published stories; cast to satisfy the interface
        sections.push({ community, stories: stories as DigestStory[] })
      }
    }

    if (sections.length === 0) {
      log.debug({ userId: user.id }, 'no new stories for user this week')
      skipped++
      continue
    }

    const communityNames = sections.map((s) => s.community.name).join(', ')
    const subject = `Tu resumen semanal — ${communityNames}`
    const html = buildDigestHtml(user.name, sections)

    try {
      await sendTransactional({ to: user.email, subject, body: html })
      log.info({ userId: user.id, communities: sections.length }, 'digest sent')
      sent++
    } catch (err) {
      log.error({ err, userId: user.id }, 'failed to send digest, continuing')
      failed++
    }
  }

  log.info({ sent, skipped, failed }, 'community digest job complete')
}
