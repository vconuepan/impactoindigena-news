import { getStoryIdsByStatus } from '../services/story.js'
import { preAssessStories } from '../services/analysis.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('preassess_stories')

export async function runPreassessStories(): Promise<void> {
  log.info('starting pre-assessment job')

  const MAX_PASSES = 5 // safety limit to avoid infinite loop if LLM keeps failing

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const ids = await getStoryIdsByStatus('fetched')
    if (ids.length === 0) {
      log.info('no fetched stories to pre-assess')
      return
    }

    log.info({ storyCount: ids.length, pass }, 'found fetched stories to pre-assess')

    const results = await preAssessStories(ids)
    log.info({ completed: results.length, total: ids.length, pass }, 'pre-assessment pass finished')

    for (const r of results) {
      log.info({ storyId: r.storyId, rating: r.rating, emotionTag: r.emotionTag }, 'pre-assessed')
    }

    // If this pass made no progress, stop to avoid a tight loop on persistent failures
    if (results.length === 0) {
      log.warn({ pass, remaining: ids.length }, 'no progress in pass — stopping to avoid loop')
      return
    }

    // If all were processed, we're done
    const remaining = await getStoryIdsByStatus('fetched')
    if (remaining.length === 0) {
      log.info({ passes: pass }, 'all fetched stories pre-assessed')
      return
    }

    log.info({ remaining: remaining.length, nextPass: pass + 1 }, 'retrying remaining fetched stories')
  }

  log.warn({ maxPasses: MAX_PASSES }, 'reached max passes — some stories may remain in fetched')
}
