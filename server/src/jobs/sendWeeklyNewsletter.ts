/**
 * sendWeeklyNewsletter — Monday morning digest of the previous week.
 *
 * Runs every Monday (cron: 0 9 * * 1, ~9 AM Chile time).
 * Covers stories from the past 7 days, sends live to all subscribers.
 * Title format: "Impacto Indígena — Semana N° XX — Del DD al DD de MMMM de YYYY"
 */
import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import {
  createNewsletter,
  assignStories,
  selectStoriesForNewsletter,
  generateContent,
  generateHtmlContent,
  sendLive,
} from '../services/newsletter.js'

const log = createLogger('send_weekly_newsletter')

/** ISO week number for a given date */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/** Title for the weekly newsletter, e.g. "Impacto Indígena — Semana N° 21 (18–24 mayo 2026)" */
function weeklyTitle(date: Date): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

  // Monday of the week that just ended (7 days ago from this Monday)
  const dow = date.getDay() || 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - (dow - 1) - 7) // previous week's Monday
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const weekNo = isoWeekNumber(monday)
  const fromDay = monday.getDate()
  const toDay = sunday.getDate()
  const fromMonth = months[monday.getMonth()]
  const toMonth = months[sunday.getMonth()]
  const year = sunday.getFullYear()

  const range = monday.getMonth() === sunday.getMonth()
    ? `${fromDay}–${toDay} de ${toMonth} de ${year}`
    : `${fromDay} de ${fromMonth} – ${toDay} de ${toMonth} de ${year}`

  return `Impacto Indígena — Semana N° ${weekNo} (${range})`
}

export async function runSendWeeklyNewsletter(): Promise<void> {
  log.info('starting weekly newsletter job')

  const today = new Date()
  const title = weeklyTitle(today)

  // Skip if a weekly newsletter was already sent this week
  const startOfWeek = new Date(today)
  const dow = today.getDay() || 7
  startOfWeek.setDate(today.getDate() - (dow - 1))
  startOfWeek.setHours(0, 0, 0, 0)

  const existing = await prisma.newsletter.findFirst({
    where: {
      createdAt: { gte: startOfWeek },
      title: { contains: 'Semana N°' },
      status: 'published',
    },
  })
  if (existing) {
    log.info({ newsletterId: existing.id }, 'weekly newsletter already sent this week, skipping')
    return
  }

  log.info({ title }, 'creating weekly newsletter')
  const newsletter = await createNewsletter({ title })
  log.info({ newsletterId: newsletter.id }, 'newsletter created')

  await assignStories(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'stories assigned')

  await selectStoriesForNewsletter(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'stories selected')

  await generateContent(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'content generated')

  await generateHtmlContent(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'html generated')

  await sendLive(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'newsletter sent!' )

  await prisma.newsletter.update({
    where: { id: newsletter.id },
    data: { status: 'published' },
  })

  log.info({ title }, 'weekly newsletter job complete')
}
