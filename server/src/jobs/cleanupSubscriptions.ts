import { createLogger } from '../lib/logger.js'
import { cleanupExpiredPendingSubscriptions } from '../services/subscribe.js'
import { cleanupExpiredAlertSubscriptions } from '../services/alerts.js'

const log = createLogger('job:cleanup_subscriptions')

/**
 * Purge abandoned double opt-in records that hold personal data: unconfirmed
 * newsletter pending_subscriptions and unconfirmed alert_subscriptions whose
 * confirmation token has expired. These can never be confirmed and serve no
 * purpose, yet retain the visitor's email. Confirmed subscriptions are kept.
 * Supports the storage-limitation principle of Ley 21.719.
 */
export async function runCleanupSubscriptions(): Promise<void> {
  log.info('starting')
  const pendingSubscriptions = await cleanupExpiredPendingSubscriptions()
  const alertSubscriptions = await cleanupExpiredAlertSubscriptions()
  log.info({ pendingSubscriptions, alertSubscriptions }, 'complete')
}
