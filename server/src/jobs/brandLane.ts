import { runBrandLaneOnce } from '../services/brandLane.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('job:brand_lane')

/**
 * Carril de marca (D5): juzga con el criterio de cada marca lo que el pipeline
 * global ya cerró y elige lo de cada día. Solo suma; ver services/brandLane.ts.
 *
 * Corre cada seis horas, como fija el diseño (sección 4): 1:30, 7:30, 13:30 y
 * 19:30, en la zona del scheduler (SCHEDULER_TIMEZONE, Santiago), igual que el
 * resto del pipeline. Cada corrida sigue a un pre-filtro (4, 10, 16, 22), y las de 7:30
 * y 19:30 siguen además a select_stories (7 y 19), para que el rescate de Voces
 * Mapuche vea lo que el selector descartó antes de publish_stories (8 y 20).
 *
 * Nace DESHABILITADO (migración 20261013000000 y seed-jobs.ts) y además no
 * llama al modelo sin D5_ENABLED=true, sin una vertical encendida en
 * community_brand_criteria y sin pautas cargadas.
 */
export async function runBrandLane(): Promise<void> {
  const reports = await runBrandLaneOnce()
  if (reports.length === 0) {
    log.info('brand lane off or no brand criteria on; nothing to do')
    return
  }
  for (const r of reports) log.info(r, 'brand lane')
}
