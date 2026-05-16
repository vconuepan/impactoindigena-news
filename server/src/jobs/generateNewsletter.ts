import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { StoryStatus } from '@prisma/client'
import { createLogger } from '../lib/logger.js'
import {
  createNewsletter,
  assignStories,
  selectStoriesForNewsletter,
  generateContent,
  generateHtmlContent,
  sendTest,
} from '../services/newsletter.js'

const log = createLogger('generate_newsletter')

/** Compute ISO week number and return title like "Week 7, 2026" */
export function getWeekTitle(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `Week ${weekNo}, ${d.getUTCFullYear()}`
}

export async function runGenerateNewsletter(): Promise<void> {
  // Must match the query in newsletter.assignStories() to avoid false positives
  const count = await prisma.story.count({
    where: {
      status: StoryStatus.published,
      dateCrawled: { gte: new Date(Date.now() - config.content.storyAssignmentDays * 24 * 60 * 60 * 1000) },
    },
  })

  if (count === 0) {
    log.info('no recent published stories, skipping newsletter generation')
    return
  }

  const today = new Date()
  const title = `Impacto Indígena — ${today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

  // Skip if a newsletter was already generated today (e.g. from a partial run retry)
  const startOfDay = new Date(today)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const existing = await prisma.newsletter.findFirst({ where: { createdAt: { gte: startOfDay } } })
  if (existing) {
    log.info({ title, newsletterId: existing.id }, 'newsletter already generated today, skipping')
    return
  }

  log.info({ title, recentStoryCount: count }, 'starting newsletter generation')

  const newsletter = await createNewsletter({ title })
  log.info({ newsletterId: newsletter.id }, 'newsletter created')

  try {
    await assignStories(newsletter.id)
    log.info({ newsletterId: newsletter.id }, 'stories assigned')

    await selectStoriesForNewsletter(newsletter.id)
    log.info({ newsletterId: newsletter.id }, 'stories selected')

    await generateContent(newsletter.id)
    log.info({ newsletterId: newsletter.id }, 'content generated')

    await generateHtmlContent(newsletter.id)
    log.info({ newsletterId: newsletter.id }, 'HTML generated')

    await sendTest(newsletter.id)
    log.info({ newsletterId: newsletter.id }, 'test email sent')
  } catch (err) {
    log.error({ newsletterId: newsletter.id, err }, 'pipeline failed, cleaning up')
    await prisma.newsletter.delete({ where: { id: newsletter.id } }).catch(() => {})
    throw err
  }
}
