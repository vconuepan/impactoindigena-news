import cron, { type ScheduledTask } from 'node-cron'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { notifyJobFailure } from '../lib/notify.js'
import { JOB_HANDLERS } from './handlers.js'

const log = createLogger('scheduler')

const tasksByName = new Map<string, ScheduledTask>()
const runningJobs = new Set<string>()

export async function initScheduler(): Promise<void> {
  log.info('initializing')

  const jobs = await prisma.jobRun.findMany()

  for (const job of jobs) {
    if (!job.enabled) {
      log.info({ jobName: job.jobName }, 'disabled, skipping')
      continue
    }

    const handler = JOB_HANDLERS[job.jobName]
    if (!handler) {
      log.warn({ jobName: job.jobName }, 'no handler found, skipping')
      continue
    }

    if (!cron.validate(job.cronExpression)) {
      log.error({ jobName: job.jobName, cronExpression: job.cronExpression }, 'invalid cron expression, skipping')
      continue
    }

    // Register cron job
    const task = cron.schedule(job.cronExpression, () => {
      runJob(job.jobName, handler)
    })
    tasksByName.set(job.jobName, task)
    log.info({ jobName: job.jobName, cronExpression: job.cronExpression }, 'registered')

    // Check if overdue
    if (isOverdue(job)) {
      log.info({ jobName: job.jobName }, 'overdue, running now')
      runJob(job.jobName, handler)
    }
  }

  log.info({ jobCount: tasksByName.size }, 'ready')
}

function isOverdue(job: { jobName: string; lastCompletedAt: Date | null; cronExpression: string }): boolean {
  if (!job.lastCompletedAt) return true

  // Simple heuristic: parse the cron to estimate interval
  // For expressions like "0 */6 * * *", the interval is ~6 hours
  // We consider a job overdue if it hasn't run in 2x the expected interval
  const intervalMs = estimateCronIntervalMs(job.cronExpression)
  if (!intervalMs) return false

  const elapsed = Date.now() - job.lastCompletedAt.getTime()
  return elapsed > intervalMs * 2
}

function estimateCronIntervalMs(cronExpr: string): number | null {
  const parts = cronExpr.split(' ')
  if (parts.length < 5) return null

  const [, hourPart, , , dowPart] = parts

  // Base interval from hour field
  let baseHours: number | null = null

  // "*/N" pattern → every N hours
  const everyMatch = hourPart.match(/^\*\/(\d+)$/)
  if (everyMatch) baseHours = parseInt(everyMatch[1])

  // "H1,H2,H3" pattern → interval between entries
  if (baseHours === null) {
    const hours = hourPart.split(',').map(Number).filter(n => !isNaN(n))
    if (hours.length >= 2) {
      baseHours = 24 / hours.length
    }
  }

  // Single hour → daily
  if (baseHours === null && /^\d+$/.test(hourPart)) baseHours = 24

  if (baseHours === null) return null

  // Factor in day-of-week restrictions
  // If only specific days are scheduled, the actual interval between
  // runs is longer than the hour-based estimate (e.g. weekly jobs)
  const dowMultiplier = estimateDowMultiplier(dowPart)

  return baseHours * dowMultiplier * 60 * 60 * 1000
}

/**
 * Estimate how many days between runs based on the day-of-week field.
 * Returns 1 for daily schedules, 7 for weekly, etc.
 */
function estimateDowMultiplier(dowPart: string): number {
  // "*" or missing → runs every day
  if (!dowPart || dowPart === '*') return 1

  // Count how many days per week this expression covers
  const daysPerWeek = countDaysInDowExpr(dowPart)
  if (daysPerWeek === null || daysPerWeek <= 0 || daysPerWeek >= 7) return 1

  // Average gap between runs in days
  return 7 / daysPerWeek
}

function countDaysInDowExpr(expr: string): number | null {
  const days = new Set<number>()

  for (const part of expr.split(',')) {
    // Range: "1-5"
    const rangeMatch = part.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1])
      const end = parseInt(rangeMatch[2])
      if (start <= end) {
        for (let d = start; d <= end; d++) days.add(d % 7)
      } else {
        // Wrap-around range: e.g., 5-2 = Fri,Sat,Sun,Mon,Tue
        for (let d = start; d <= 6; d++) days.add(d % 7)
        for (let d = 0; d <= end; d++) days.add(d % 7)
      }
      continue
    }
    // Single day: "6"
    if (/^\d+$/.test(part)) {
      days.add(parseInt(part) % 7)
      continue
    }
    // Unrecognized pattern (e.g. "*/2") → fall back
    return null
  }

  return days.size
}

async function runJob(jobName: string, handler: () => Promise<void>): Promise<void> {
  if (runningJobs.has(jobName)) {
    log.warn({ jobName }, 'already running, skipping')
    return
  }

  runningJobs.add(jobName)
  log.info({ jobName }, 'started')

  await prisma.jobRun.update({
    where: { jobName },
    data: { lastStartedAt: new Date(), lastError: null },
  })

  try {
    await handler()
    await prisma.jobRun.update({
      where: { jobName },
      data: { lastCompletedAt: new Date() },
    })
    log.info({ jobName }, 'completed')
  } catch (err) {
    let errorMsg = err instanceof Error ? err.message : String(err)
    // Prisma errors include additional details in meta (e.g. raw query DB error code/message)
    if (err && typeof err === 'object' && 'code' in err && 'meta' in err) {
      const pe = err as { code: string; meta?: Record<string, unknown> }
      if (pe.meta) errorMsg += ` | Prisma ${pe.code}: ${JSON.stringify(pe.meta)}`
    }
    log.error({ jobName, err }, 'job failed')
    await prisma.jobRun.update({
      where: { jobName },
      data: { lastError: errorMsg, lastCompletedAt: new Date() },
    })
    notifyJobFailure(jobName, errorMsg).catch(() => {})
  } finally {
    runningJobs.delete(jobName)
  }
}

// Exported for manual trigger via admin API and testing
export { runJob, runningJobs, estimateCronIntervalMs }

export async function reloadJob(jobName: string): Promise<void> {
  // Stop existing task if any
  const existing = tasksByName.get(jobName)
  if (existing) existing.stop()
  tasksByName.delete(jobName)

  // Read fresh config from DB
  const job = await prisma.jobRun.findUnique({ where: { jobName } })
  if (!job || !job.enabled) {
    log.info({ jobName }, 'job disabled or not found, unregistered')
    return
  }

  const handler = JOB_HANDLERS[jobName]
  if (!handler || !cron.validate(job.cronExpression)) {
    log.warn({ jobName }, 'no handler or invalid cron, not re-registering')
    return
  }

  const task = cron.schedule(job.cronExpression, () => {
    runJob(jobName, handler)
  })
  tasksByName.set(jobName, task)
  log.info({ jobName, cronExpression: job.cronExpression }, 'reloaded')
}

export function stopScheduler(): void {
  for (const task of tasksByName.values()) {
    task.stop()
  }
  tasksByName.clear()
}
