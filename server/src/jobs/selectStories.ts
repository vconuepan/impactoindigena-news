import { getStoryIdsByStatus } from '../services/story.js'
import { selectStoriesInGroups } from '../services/analysis.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'

const log = createLogger('select_stories')

export async function runSelectStories(): Promise<void> {
  log.info('starting selection job')

  // Snapshot all analyzed stories before filtering, so stories arriving
  // after this point are processed in the next run.
  const allAnalyzed = await getStoryIdsByStatus('analyzed')

  const ids = await getStoryIdsByStatus('analyzed', { relevanceMin: config.selection.relevanceMin })

  // Reject analyzed stories from the snapshot that don't meet threshold
  const qualifiedSet = new Set(ids)
  const belowThreshold = allAnalyzed.filter(id => !qualifiedSet.has(id))

  if (belowThreshold.length > 0) {
    await prisma.story.updateMany({
      where: { id: { in: belowThreshold }, status: 'analyzed' },
      data: { status: 'rejected' },
    })
    log.info({ count: belowThreshold.length }, 'rejected analyzed stories below selection relevance minimum')
  }

  if (ids.length === 0) {
    log.info(`no analyzed stories with relevance >= ${config.selection.relevanceMin}`)
    return
  }

  log.info({ storyCount: ids.length, concurrency: config.concurrency.select }, 'selecting stories')

  const result = await selectStoriesInGroups(ids)

  log.info({ selected: result.selected, rejected: result.rejected, errors: result.errors }, 'selection job finished')

  // Un grupo que falla deja sus noticias en `analyzed` y no publica nada. Hasta el 23-nov-2026
  // este job terminaba «sin error» igual: con el modelo grande rechazando la llamada, el .news
  // estuvo tres días sin publicar y el panel mostraba todo en verde. El trabajo de los grupos que
  // sí resultaron ya quedó guardado; el error se lanza al final para que `job_runs.lastError` y el
  // aviso de fallo lo muestren.
  if (result.errors > 0) {
    throw new Error(
      `select_stories: ${result.errors} grupo(s) fallaron y sus noticias siguen sin seleccionar` +
      (result.firstError ? `: ${result.firstError}` : ''),
    )
  }
}
