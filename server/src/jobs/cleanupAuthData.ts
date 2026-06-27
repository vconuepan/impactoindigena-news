import { createLogger } from '../lib/logger.js'
import { cleanupExpiredTokens, cleanupExpiredMagicLinks } from '../services/auth.js'

const log = createLogger('job:cleanup_auth_data')

/**
 * Purge expired authentication artifacts that hold personal data:
 * expired refresh tokens and timed-out/used magic links. Without this job
 * the refresh_tokens and magic_links tables grow without bound, breaching
 * the storage-limitation principle of Ley 21.719 and widening the security
 * surface (Art. 14 quinquies). Satisfies the CleanupExpiredTokens rule in
 * authentication.allium.
 */
export async function runCleanupAuthData(): Promise<void> {
  log.info('starting')
  const refreshTokens = await cleanupExpiredTokens()
  const magicLinks = await cleanupExpiredMagicLinks()
  log.info({ refreshTokens, magicLinks }, 'complete')
}
