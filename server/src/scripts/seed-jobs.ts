import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Keep in sync with server/src/jobs/handlers.ts
// All jobs start disabled — enable via admin UI after verifying config.
const JOB_SEEDS: Array<{ jobName: string; cronExpression: string; enabled?: boolean }> = [
  // --- Pipeline ---
  { jobName: 'crawl_feeds',             cronExpression: '0 */6 * * *' },
  { jobName: 'preassess_stories',       cronExpression: '0 1,7,13,19 * * *' },
  { jobName: 'assess_stories',          cronExpression: '0 9,21 * * *' },
  { jobName: 'select_stories',          cronExpression: '0 10 * * *' },
  { jobName: 'publish_stories',         cronExpression: '0 11 * * *' },
  // --- Social ---
  { jobName: 'social_auto_post',        cronExpression: '30 11 * * *' },
  { jobName: 'bluesky_update_metrics',  cronExpression: '0 */6 * * *' },
  { jobName: 'mastodon_update_metrics', cronExpression: '0 4 * * *' },
  { jobName: 'instagram_update_metrics',cronExpression: '0 */6 * * *' },
  { jobName: 'linkedin_update_metrics', cronExpression: '0 */6 * * *' },
  // --- Newsletter ---
  // generate_newsletter: miércoles y sábados 4 AM UTC (2× por semana — genera Jue y Lun)
  { jobName: 'generate_newsletter',       cronExpression: '0 4 * * 3,6' },
  // send_newsletter: lunes y jueves 12 PM UTC (~9 AM Chile)
  { jobName: 'send_newsletter',           cronExpression: '0 12 * * 1,4' },
  // send_private_newsletter: lunes y jueves 12:30 PM UTC (offset para no solapar)
  { jobName: 'send_private_newsletter',   cronExpression: '30 12 * * 1,4' },
  // send_weekly_newsletter: lunes 9 AM UTC (~6 AM Chile) — resumen semana anterior
  { jobName: 'send_weekly_newsletter',    cronExpression: '0 9 * * 1',  enabled: true },
  // send_community_digest: lunes 8 AM UTC (~5 AM Chile) — enabled by default
  { jobName: 'send_community_digest',     cronExpression: '0 8 * * 1',  enabled: true },
  // send_alerts: diario 9 AM UTC (~6 AM Chile) — enabled by default
  { jobName: 'send_alerts',               cronExpression: '0 9 * * *',  enabled: true },
  // --- Content ---
  // generate_editorial: domingos 5 AM UTC (antes del lunes)
  { jobName: 'generate_editorial',  cronExpression: '0 5 * * 0' },
  // scrape_docip: diario 2 AM UTC (baja carga horaria)
  { jobName: 'scrape_docip',        cronExpression: '0 2 * * *' },
]

async function main() {
  const results = await Promise.all(
    JOB_SEEDS.map(({ jobName, cronExpression, enabled = false }) =>
      prisma.jobRun.upsert({
        where: { jobName },
        update: {},
        create: { jobName, cronExpression, enabled },
      })
    )
  )

  console.log(`Seeded ${results.length} job runs`)
  results.forEach((j) => console.log(`  ${j.enabled ? '✓' : '○'} ${j.jobName}  (${j.cronExpression})`))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
