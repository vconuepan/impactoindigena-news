import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import { summarizeError } from '../utils/errors.js'
import { isBlueskyConfigured, createPost as createBlueskyPost } from '../lib/bluesky.js'
import { isMastodonConfigured, createStatus } from '../lib/mastodon.js'
import { isTwitterConfigured, createTweet } from '../lib/twitter.js'
import { isInstagramConfigured, createSingleImagePost } from '../lib/instagram.js'
import { generateAndUploadAgendaCard } from '../lib/agendaCard.js'
import {
  selectWeeklyAgendaItems,
  buildDigestText,
  buildInstagramCaption,
  isSameIsoWeek,
  AGENDA_SECTION_PATH,
} from '../services/agendaDigest.js'

const log = createLogger('job:agenda_weekly_digest')

const JOB_NAME = 'agenda_weekly_digest'

/**
 * Fase 3 — weekly "Incidencia Internacional" digest to social channels.
 *
 * Posts a count-based teaser (this week's events / calls / opportunities /
 * publications) that links back to `/incidencia-internacional`, where the full
 * dated list lives. Text channels (Bluesky/Mastodon/Twitter) post the teaser;
 * Instagram posts a rendered brand card. No post is made on an empty week.
 *
 * Idempotency: at most one digest per ISO week, so an overdue-run on startup or
 * a manual re-trigger in the same week does not double-post. The gate reads the
 * job's own `lastCompletedAt` (stamped by the scheduler after a successful run).
 */
export async function runAgendaWeeklyDigest(): Promise<void> {
  const cfg = config.agenda.digest
  if (!cfg.enabled) {
    log.info('agenda weekly digest disabled via config')
    return
  }

  const now = new Date()

  const jobRun = await prisma.jobRun.findUnique({ where: { jobName: JOB_NAME } }).catch(() => null)
  if (jobRun?.lastCompletedAt && isSameIsoWeek(jobRun.lastCompletedAt, now)) {
    log.info({ lastCompletedAt: jobRun.lastCompletedAt }, 'digest already published this ISO week, skipping')
    return
  }

  const { items, counts } = await selectWeeklyAgendaItems(now)
  if (counts.total === 0) {
    log.info('no agenda items in this week\'s window — nothing to post')
    return
  }
  log.info({ counts, itemCount: items.length }, 'weekly agenda selection')

  const sectionUrl = `${config.siteUrl}${AGENDA_SECTION_PATH}`

  const channels: { name: string; run: () => Promise<unknown> }[] = []

  if (cfg.channels.bluesky && isBlueskyConfigured()) {
    channels.push({
      name: 'bluesky',
      run: () =>
        createBlueskyPost(
          buildDigestText(counts, 'bluesky'),
          {
            uri: sectionUrl,
            title: 'Incidencia Internacional Indígena',
            description:
              'Eventos, convocatorias y oportunidades ante la ONU y el sistema interamericano',
          },
          'Impacto Indígena',
          config.siteUrl,
        ),
    })
  }

  if (cfg.channels.mastodon && isMastodonConfigured()) {
    channels.push({
      name: 'mastodon',
      run: () => createStatus(buildDigestText(counts, 'mastodon'), { language: 'es' }),
    })
  }

  if (cfg.channels.twitter && isTwitterConfigured()) {
    channels.push({
      name: 'twitter',
      run: () => createTweet(buildDigestText(counts, 'twitter')),
    })
  }

  if (cfg.channels.instagram && isInstagramConfigured()) {
    channels.push({
      name: 'instagram',
      run: async () => {
        const imageUrl = await generateAndUploadAgendaCard(counts, now)
        if (!imageUrl) {
          log.warn('instagram skipped: no image (R2 not configured)')
          return
        }
        return createSingleImagePost(imageUrl, buildInstagramCaption(counts))
      },
    })
  }

  if (channels.length === 0) {
    log.info('no configured/enabled channels for agenda digest')
    return
  }

  // Post sequentially with a delay between channels (mirrors socialAutoPost).
  // A failure on one channel is logged and never aborts the others.
  for (const channel of channels) {
    try {
      log.info({ channel: channel.name }, 'publishing weekly agenda digest')
      await channel.run()
      log.info({ channel: channel.name }, 'weekly agenda digest published')
    } catch (err) {
      log.error({ reason: summarizeError(err), channel: channel.name }, 'agenda digest failed for channel')
    }
    await new Promise((resolve) => setTimeout(resolve, cfg.postDelayMs))
  }

  log.info('agenda weekly digest job complete')
}
