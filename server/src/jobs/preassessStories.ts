import { getStoryIdsByStatus } from '../services/story.js'
import { preAssessStories } from '../services/analysis.js'
import { createLogger } from '../lib/logger.js'
import { config } from '../config.js'

const log = createLogger('preassess_stories')

/**
 * Umbral de salud del primer pase. Por debajo, el job termina con error aunque
 * haya persistido lo que pudo: el scheduler deja `lastError`, el panel lo pinta
 * y sale la alerta. Antes `Promise.allSettled` se tragaba los lotes caidos y un
 * job que fallaba el 99 % por dentro aparecia completado (12-oct-2026: 888 de
 * 889 lotes, durante meses, sin una sola alerta).
 */
const MIN_FIRST_PASS_RATIO = 0.5

/** Ventana de la cola: ver `config.preassess.maxAgeDays`. */
const QUEUE_WINDOW = { hoursAgo: config.preassess.maxAgeDays * 24 }

export async function runPreassessStories(): Promise<void> {
  log.info('starting pre-assessment job')

  const MAX_PASSES = 5 // safety limit to avoid infinite loop if LLM keeps failing
  let firstPass: { completed: number; total: number } | null = null

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const ids = await getStoryIdsByStatus('fetched', QUEUE_WINDOW)
    if (ids.length === 0) {
      log.info('no fetched stories to pre-assess')
      return
    }

    log.info({ storyCount: ids.length, pass }, 'found fetched stories to pre-assess')

    const results = await preAssessStories(ids)
    log.info({ completed: results.length, total: ids.length, pass }, 'pre-assessment pass finished')
    if (!firstPass) firstPass = { completed: results.length, total: ids.length }

    for (const r of results) {
      log.info({ storyId: r.storyId, rating: r.rating, emotionTag: r.emotionTag, narrativeFrame: r.narrativeFrame }, 'pre-assessed')
    }

    // If this pass made no progress, stop to avoid a tight loop on persistent failures
    if (results.length === 0) {
      log.warn({ pass, remaining: ids.length }, 'no progress in pass — stopping to avoid loop')
      // Solo es un error si es el PRIMER pase: ahi "nada paso" significa que el
      // modelo o el esquema estan rotos para toda la cola. En un pase posterior
      // significa rezagados que el modelo no logra devolver bien (el 12-oct, la
      // primera corrida sana dejo 10 de 4.145 en un lote que Azure rechazaba con
      // 400) y eso no convierte en fallida una corrida que hizo el 99 %.
      if (pass === 1) {
        throw new Error(`pre-assessment: 0 de ${ids.length} historias pasaron en el primer pase; revisar "batch failed" en el log`)
      }
      break
    }

    // If all were processed, we're done
    const remaining = await getStoryIdsByStatus('fetched', QUEUE_WINDOW)
    if (remaining.length === 0) {
      log.info({ passes: pass }, 'all fetched stories pre-assessed')
      assertFirstPassHealthy(firstPass)
      return
    }

    log.info({ remaining: remaining.length, nextPass: pass + 1 }, 'retrying remaining fetched stories')
  }

  log.warn({ maxPasses: MAX_PASSES }, 'reached max passes — some stories may remain in fetched')
  assertFirstPassHealthy(firstPass)
}

function assertFirstPassHealthy(firstPass: { completed: number; total: number } | null): void {
  if (!firstPass || firstPass.total === 0) return
  const ratio = firstPass.completed / firstPass.total
  if (ratio >= MIN_FIRST_PASS_RATIO) return
  const pct = Math.round(ratio * 1000) / 10
  throw new Error(
    `pre-assessment: solo ${firstPass.completed} de ${firstPass.total} historias pasaron en el primer pase (${pct} %); revisar "batch failed" en el log`,
  )
}
