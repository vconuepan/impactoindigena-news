import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import * as storyService from '../../services/story.js'
import * as analysisService from '../../services/analysis.js'
import { crawlUrl } from '../../services/crawler.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import {
  createStorySchema,
  updateStorySchema,
  updateStoryStatusSchema,
  bulkUpdateStatusSchema,
  storyQuerySchema,
  batchStoriesQuerySchema,
  preassessBodySchema,
  selectBodySchema,
  bulkStoryIdsSchema,
  bulkSelectIdsSchema,
} from '../../schemas/story.js'
import { taskRegistry } from '../../lib/taskRegistry.js'
import prisma from '../../lib/prisma.js'
import { writeAuditLog } from '../../services/audit.js'
import { crawlUrlSchema } from '../../schemas/job.js'

const router = Router()
const log = createLogger('stories')

/**
 * Rastro de cada cambio de estado hecho a mano (D4, Tanda B, item 12): hasta
 * el 4-oct-2026 ninguna de las cuatro rutas de estado auditaba. `from` se lee
 * antes de escribir; si la lectura falla no se bloquea la operacion.
 */
async function statusBefore(ids: string[]): Promise<Record<string, string>> {
  try {
    const rows = await prisma.story.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
    return Object.fromEntries(rows.map((r) => [r.id, r.status]))
  } catch {
    return {}
  }
}

function auditStatus(req: import('express').Request, id: string, from: string | undefined, to: string): Promise<void> {
  return writeAuditLog({ actor: req.user, action: 'story.status', targetType: 'story', targetId: id, metadata: { from: from ?? null, to } })
}


router.get('/stats', async (_req, res) => {
  try {
    const stats = await storyService.getStoryStats()
    res.json(stats)
  } catch (err) {
    log.error({ err }, 'failed to fetch story stats')
    res.status(500).json({ error: 'Failed to fetch story stats' })
  }
})

router.get('/', validateQuery(storyQuerySchema), async (req, res) => {
  try {
    const filters = req.parsedQuery!
    const result = await storyService.getStories(filters)
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to fetch stories')
    res.status(500).json({ error: 'Failed to fetch stories' })
  }
})

router.get('/batch', validateQuery(batchStoriesQuerySchema), async (req, res) => {
  try {
    const { ids } = req.parsedQuery!
    if (ids.length === 0) {
      res.json([])
      return
    }
    const stories = await storyService.getStoriesByIds(ids)
    res.json(stories)
  } catch (err) {
    log.error({ err }, 'failed to fetch batch stories')
    res.status(500).json({ error: 'Failed to fetch batch stories' })
  }
})

// --- Bulk task endpoints ---

function filterProcessingIds(storyIds: string[]): { filtered: string[]; skipped: string[] } {
  const processingIds = new Set(taskRegistry.getProcessingStoryIds())
  const filtered: string[] = []
  const skipped: string[] = []
  for (const id of storyIds) {
    if (processingIds.has(id)) skipped.push(id)
    else filtered.push(id)
  }
  return { filtered, skipped }
}

router.post('/bulk-preassess', expensiveOpLimiter, validateBody(bulkStoryIdsSchema), async (req, res) => {
  try {
    const { filtered, skipped } = filterProcessingIds(req.body.storyIds)
    if (filtered.length === 0) {
      res.status(409).json({ error: 'All stories are already being processed', skipped })
      return
    }
    const taskId = taskRegistry.create('preassess', filtered.length, filtered)
    analysisService.bulkPreAssess(filtered, taskId)
    res.status(202).json({ taskId, ...(skipped.length > 0 ? { skipped } : {}) })
  } catch (err) {
    log.error({ err }, 'failed to start bulk pre-assess')
    res.status(500).json({ error: 'Failed to start bulk pre-assess' })
  }
})

router.post('/bulk-reclassify', expensiveOpLimiter, validateBody(bulkStoryIdsSchema), async (req, res) => {
  try {
    const { filtered, skipped } = filterProcessingIds(req.body.storyIds)
    if (filtered.length === 0) {
      res.status(409).json({ error: 'All stories are already being processed', skipped })
      return
    }
    const taskId = taskRegistry.create('reclassify', filtered.length, filtered)
    analysisService.bulkReclassify(filtered, taskId)
    res.status(202).json({ taskId, ...(skipped.length > 0 ? { skipped } : {}) })
  } catch (err) {
    log.error({ err }, 'failed to start bulk reclassify')
    res.status(500).json({ error: 'Failed to start bulk reclassify' })
  }
})

router.post('/bulk-tag-emotions', expensiveOpLimiter, validateBody(bulkStoryIdsSchema), async (req, res) => {
  try {
    const { filtered, skipped } = filterProcessingIds(req.body.storyIds)
    if (filtered.length === 0) {
      res.status(409).json({ error: 'All stories are already being processed', skipped })
      return
    }
    const taskId = taskRegistry.create('emotion', filtered.length, filtered)
    analysisService.bulkTagEmotions(filtered, taskId)
    res.status(202).json({ taskId, ...(skipped.length > 0 ? { skipped } : {}) })
  } catch (err) {
    log.error({ err }, 'failed to start bulk emotion tagging')
    res.status(500).json({ error: 'Failed to start bulk emotion tagging' })
  }
})

router.post('/bulk-assess', expensiveOpLimiter, validateBody(bulkStoryIdsSchema), async (req, res) => {
  try {
    const { filtered, skipped } = filterProcessingIds(req.body.storyIds)
    if (filtered.length === 0) {
      res.status(409).json({ error: 'All stories are already being processed', skipped })
      return
    }
    const taskId = taskRegistry.create('assess', filtered.length, filtered)
    analysisService.bulkAssess(filtered, taskId)
    res.status(202).json({ taskId, ...(skipped.length > 0 ? { skipped } : {}) })
  } catch (err) {
    log.error({ err }, 'failed to start bulk assess')
    res.status(500).json({ error: 'Failed to start bulk assess' })
  }
})

router.post('/bulk-select', expensiveOpLimiter, validateBody(bulkSelectIdsSchema), async (req, res) => {
  try {
    const { filtered, skipped } = filterProcessingIds(req.body.storyIds)
    if (filtered.length === 0) {
      res.status(409).json({ error: 'All stories are already being processed', skipped })
      return
    }
    if (filtered.length < 2) {
      res.status(400).json({ error: 'At least 2 non-processing story IDs are required after filtering', skipped })
      return
    }
    const taskId = taskRegistry.create('select', filtered.length, filtered)
    analysisService.bulkSelect(filtered, taskId)
    res.status(202).json({ taskId, ...(skipped.length > 0 ? { skipped } : {}) })
  } catch (err) {
    log.error({ err }, 'failed to start bulk select')
    res.status(500).json({ error: 'Failed to start bulk select' })
  }
})

router.get('/processing', async (_req, res) => {
  try {
    const storyIds = taskRegistry.getProcessingStoryIds()
    res.json({ storyIds })
  } catch (err) {
    log.error({ err }, 'failed to get processing story IDs')
    res.status(500).json({ error: 'Failed to get processing story IDs' })
  }
})

router.get('/tasks/:taskId', async (req, res) => {
  try {
    const task = taskRegistry.get(req.params.taskId)
    if (!task) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.json(task)
  } catch (err) {
    log.error({ err }, 'failed to get task status')
    res.status(500).json({ error: 'Failed to get task status' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const story = await storyService.getStoryById(req.params.id)
    if (!story) {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    res.json(story)
  } catch (err) {
    log.error({ err }, 'failed to fetch story')
    res.status(500).json({ error: 'Failed to fetch story' })
  }
})

router.post('/', validateBody(createStorySchema), async (req, res) => {
  try {
    const story = await storyService.createStory(req.body)
    res.status(201).json(story)
  } catch (err: any) {
    if (err.message === 'Feed not found') {
      res.status(400).json({ error: err.message })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A story with this URL already exists' })
      return
    }
    log.error({ err }, 'failed to create story')
    res.status(500).json({ error: 'Failed to create story' })
  }
})

router.put('/:id', validateBody(updateStorySchema), async (req, res) => {
  try {
    const story = await storyService.updateStory(req.params.id, req.body)
    res.json(story)
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to update story')
    res.status(500).json({ error: 'Failed to update story' })
  }
})

router.put('/:id/status', validateBody(updateStoryStatusSchema), async (req, res) => {
  try {
    const antes = await statusBefore([req.params.id])
    const story = await storyService.updateStoryStatus(req.params.id, req.body.status)
    await auditStatus(req, req.params.id, antes[req.params.id], req.body.status)
    res.json(story)
  } catch (err: any) {
    if (err.code === 'P2025' || err.message === 'Story not found') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to update story status')
    res.status(500).json({ error: 'Failed to update story status' })
  }
})

router.post('/bulk-status', validateBody(bulkUpdateStatusSchema), async (req, res) => {
  try {
    const antes = await statusBefore(req.body.ids)
    const result = await storyService.bulkUpdateStatus(req.body.ids, req.body.status)
    const from: Record<string, number> = {}
    for (const id of req.body.ids) from[antes[id] ?? 'unknown'] = (from[antes[id] ?? 'unknown'] ?? 0) + 1
    await writeAuditLog({
      actor: req.user,
      action: 'story.bulk_status',
      targetType: 'story',
      metadata: { to: req.body.status, requested: req.body.ids.length, updated: result.count, from, ids: req.body.ids },
    })
    res.json({ updated: result.count })
  } catch (err) {
    log.error({ err }, 'failed to bulk update story status')
    res.status(500).json({ error: 'Failed to bulk update story status' })
  }
})

router.post('/preassess', expensiveOpLimiter, validateBody(preassessBodySchema), async (req, res) => {
  try {
    let storyIds: string[]
    if (req.body.storyIds && req.body.storyIds.length > 0) {
      storyIds = req.body.storyIds
    } else {
      storyIds = await storyService.getStoryIdsByStatus('fetched')
    }

    if (storyIds.length === 0) {
      res.json({ processed: 0, results: [] })
      return
    }

    const results = await analysisService.preAssessStories(storyIds)
    res.json({ processed: results.length, results })
  } catch (err) {
    log.error({ err }, 'failed to pre-assess stories')
    res.status(500).json({ error: 'Failed to pre-assess stories' })
  }
})

router.post('/:id/assess', expensiveOpLimiter, async (req, res) => {
  try {
    await analysisService.assessStory(req.params.id)
    const story = await storyService.getStoryById(req.params.id)
    res.json(story)
  } catch (err: any) {
    if (err.message === 'Story not found') {
      res.status(404).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to assess story')
    res.status(500).json({ error: 'Failed to assess story' })
  }
})

router.post('/select', expensiveOpLimiter, validateBody(selectBodySchema), async (req, res) => {
  try {
    const result = await analysisService.selectStories(req.body.storyIds)
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to select stories')
    res.status(500).json({ error: 'Failed to select stories' })
  }
})

router.post('/:id/publish', async (req, res) => {
  try {
    const antes = await statusBefore([req.params.id])
    const story = await storyService.publishStory(req.params.id)
    await auditStatus(req, req.params.id, antes[req.params.id], 'published')
    res.json(story)
  } catch (err: any) {
    if (err.code === 'P2025' || err.message === 'Story not found') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to publish story')
    res.status(500).json({ error: 'Failed to publish story' })
  }
})

router.post('/:id/reject', async (req, res) => {
  try {
    const antes = await statusBefore([req.params.id])
    const story = await storyService.rejectStory(req.params.id)
    await auditStatus(req, req.params.id, antes[req.params.id], 'rejected')
    res.json(story)
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to reject story')
    res.status(500).json({ error: 'Failed to reject story' })
  }
})

router.post('/:id/dissolve-cluster', async (req, res) => {
  try {
    await storyService.dissolveCluster(req.params.id)
    const story = await storyService.getStoryById(req.params.id)
    res.json(story)
  } catch (err: any) {
    if (err.message === 'Story is not in a cluster') {
      res.status(400).json({ error: err.message })
      return
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to dissolve cluster')
    res.status(500).json({ error: 'Failed to dissolve cluster' })
  }
})

router.post('/crawl-url', validateBody(crawlUrlSchema), async (req, res) => {
  try {
    const result = await crawlUrl(req.body.url, req.body.feedId)
    if (!result) {
      res.status(422).json({ error: 'Could not extract content from URL' })
      return
    }
    res.status(201).json(result)
  } catch (err: any) {
    if (err.message === 'Feed not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message === 'URL already crawled') {
      res.status(409).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to crawl URL')
    res.status(500).json({ error: 'Failed to crawl URL' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await storyService.deleteStory(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    log.error({ err }, 'failed to delete story')
    res.status(500).json({ error: 'Failed to delete story' })
  }
})

export default router
