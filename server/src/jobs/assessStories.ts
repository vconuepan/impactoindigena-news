import { getStoryIdsByStatus } from '../services/story.js'
import { assessStories } from '../services/analysis.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'

const log = createLogger('assess_stories')

export async function runAssessStories(): Promise<void> {
  log.info('starting full assessment job')

  const globalThreshold = config.assess.fullAssessmentThreshold

  // Fetch per-issue thresholds
  const issues = await prisma.issue.findMany({
    select: { id: true, name: true, minPreRating: true },
  })

  // Snapshot all pre_analyzed stories before building qualified set,
  // so stories arriving after this point are processed in the next run
  // rather than rejected prematurely.
  const allPreAnalyzed = await getStoryIdsByStatus('pre_analyzed')

  const allIds: string[] = []

  for (const issue of issues) {
    const threshold = issue.minPreRating ?? globalThreshold
    const ids = await getStoryIdsByStatus('pre_analyzed', { ratingMin: threshold, issueId: issue.id })
    if (ids.length > 0) {
      log.info({ issue: issue.name, threshold, storyCount: ids.length }, 'stories qualifying for assessment')
      allIds.push(...ids)
    }
  }

  // Stories with no issue use the global threshold
  const unassignedIds = await getStoryIdsByStatus('pre_analyzed', { ratingMin: globalThreshold, issueId: null })
  if (unassignedIds.length > 0) {
    log.info({ threshold: globalThreshold, storyCount: unassignedIds.length }, 'unassigned stories qualifying for assessment')
    allIds.push(...unassignedIds)
  }

  // Reject pre_analyzed stories from the snapshot that don't meet any threshold
  const qualifiedSet = new Set(allIds)
  const belowThreshold = allPreAnalyzed.filter(id => !qualifiedSet.has(id))

  if (belowThreshold.length > 0) {
    await prisma.story.updateMany({
      where: { id: { in: belowThreshold }, status: 'pre_analyzed' },
      data: { status: 'rejected' },
    })
    log.info({ count: belowThreshold.length }, 'rejected pre_analyzed stories below assessment threshold')
  }

  if (allIds.length === 0) {
    log.info('no pre-analyzed stories above threshold')
    return
  }

  log.info({ storyCount: allIds.length, concurrency: config.concurrency.assess }, 'assessing stories')

  // Each assessStory() call triggers embedding + dedup as fire-and-forget
  const result = await assessStories(allIds)

  log.info({ completed: result.completed, errors: result.errors, total: allIds.length }, 'assessment job finished')

  // Surface errors to job_runs.last_error so they're visible in the admin panel
  if (result.errors > 0 && result.completed === 0) {
    throw new Error(`All ${result.errors} story assessments failed — check server logs for root cause (LLM/embedding error)`)
  }
  if (result.errors > 0) {
    log.warn({ errors: result.errors, completed: result.completed }, 'partial assessment failures — check server logs')
  }
}
