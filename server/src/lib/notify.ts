import axios from 'axios'
import { createLogger } from './logger.js'
import { config } from '../config.js'
import { sendTransactional } from '../services/brevo.js'

const log = createLogger('notify')

// In-memory throttle: at most one email per job per window. A job that keeps
// failing every cron tick (e.g. a rotated LLM key) would otherwise flood the
// inbox — the Azure 401 outage failed thousands of times over 4 days.
const lastEmailAt = new Map<string, number>()

/**
 * Fan out a job-failure notification to all configured channels.
 * Channels are independent: one failing never blocks the other.
 */
export async function notifyJobFailure(jobName: string, error: string): Promise<void> {
  await Promise.allSettled([
    sendWebhook(jobName, error),
    sendEmailAlert(jobName, error),
  ])
}

async function sendWebhook(jobName: string, error: string): Promise<void> {
  const url = process.env.WEBHOOK_URL
  if (!url) return

  try {
    await axios.post(url, {
      content: `Job **${jobName}** failed: ${error}`,
      text: `Job "${jobName}" failed: ${error}`,
      jobName,
      error,
      timestamp: new Date().toISOString(),
    }, { timeout: 5000, maxContentLength: 1 * 1024 * 1024 })
  } catch (err) {
    log.warn({ err, jobName }, 'failed to send webhook notification')
  }
}

async function sendEmailAlert(jobName: string, error: string): Promise<void> {
  const to = config.alerts.failureEmail
  if (!to) return

  // Throttle per job so a persistently failing job sends at most one email
  // per window instead of one per cron tick.
  const now = Date.now()
  const windowMs = config.alerts.throttleHours * 60 * 60 * 1000
  const last = lastEmailAt.get(jobName) ?? 0
  if (now - last < windowMs) {
    log.info({ jobName }, 'job failure email throttled')
    return
  }
  lastEmailAt.set(jobName, now)

  const safeError = error.length > 1000 ? `${error.slice(0, 1000)}…` : error
  const timestamp = new Date().toISOString()

  try {
    await sendTransactional({
      to,
      subject: `⚠️ Job falló: ${jobName} — Impacto Indígena`,
      body: `
        <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px;">
          <h2 style="color: #C8473A; margin: 0 0 8px;">Falló un job programado</h2>
          <p style="color: #1C1917; font-size: 15px; margin: 0 0 16px;">
            El job <strong>${escapeHtml(jobName)}</strong> falló en el pipeline de Impacto Indígena.
          </p>
          <table style="font-size: 14px; color: #44403C; border-collapse: collapse;">
            <tr><td style="padding: 4px 12px 4px 0; color: #78716C;">Job</td><td><code>${escapeHtml(jobName)}</code></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #78716C; vertical-align: top;">Error</td><td><code>${escapeHtml(safeError)}</code></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #78716C;">Hora (UTC)</td><td>${timestamp}</td></tr>
          </table>
          <p style="color: #78716C; font-size: 13px; margin: 16px 0 0;">
            Revisa el panel de administración para más detalle. No recibirás otro aviso de este mismo job
            durante las próximas ${config.alerts.throttleHours} horas.
          </p>
        </div>
      `.trim(),
    })
    log.info({ jobName, to }, 'job failure email sent')
  } catch (err) {
    log.warn({ err, jobName }, 'failed to send job failure email')
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
