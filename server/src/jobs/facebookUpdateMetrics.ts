import { createLogger } from '../lib/logger.js'
import { isFacebookConfigured } from '../lib/facebook.js'
import { updateMetrics } from '../services/facebook.js'

const log = createLogger('facebook_update_metrics')

export async function runFacebookUpdateMetrics(): Promise<void> {
  log.info('starting Facebook metrics update job')

  if (!isFacebookConfigured()) {
    log.warn('Facebook credentials not configured, skipping metrics update')
    return
  }

  try {
    await updateMetrics()
    log.info('Facebook metrics update complete')
  } catch (err) {
    log.error({ err }, 'Facebook metrics update failed')
    throw err
  }
}
