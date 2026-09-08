import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Keep in sync with server/src/jobs/handlers.ts
// All jobs start disabled — enable via admin UI after verifying config.
/**
 * TODOS LOS CRON SE LEEN EN HORA DE CHILE (America/Santiago).
 *
 * Desde el 8-sep-2026 `cron.schedule()` recibe la zona (`config.scheduler
 * .timezone`, jobs/scheduler.ts), asi que lo que se escribe aqui y en el panel
 * es la hora local, sin conversion mental. Antes no se pasaba ninguna y usaba
 * la del proceso —UTC en el App Service— mientras `/admin/jobs/server-time`
 * decia «America/Santiago»: un horario editado desde el panel corria tres o
 * cuatro horas antes de lo que su autor creia.
 *
 * POR QUE LA ZONA Y NO UNA CONVERSION HORNEADA: Chile esta en UTC-3 en verano
 * —desde el primer domingo de septiembre— y en UTC-4 el resto del año. Restar
 * tres horas a mano funcionaria hasta abril, cuando todo se desplazaria una
 * hora sin que nadie tocara nada. Con la zona, las 08:00 son las 08:00 todo el
 * año y node-cron se encarga del cambio de estacion.
 *
 * OJO AL CAMBIAR ESTO: los horarios vivos estan en la tabla `job_runs`, no
 * aqui. Cambiar la zona reinterpreta lo que ya esta guardado, asi que los
 * valores de la base tienen que moverse en la misma maniobra.
 *
 * LA CADENA DEL PIPELINE ES UN EMBUDO, y su orden importa: crawl alimenta a
 * preassess, preassess a assess, assess a select, y select a publish. Cada etapa
 * debe correr DESPUES de la que la alimenta, o trabaja sobre lo de la vuelta
 * anterior.
 *
 * Publicar dos veces al dia —8 y 20, hora de Chile— y no una sola:
 * el material se prepara a lo largo del dia (crawl cada 6 h, preassess 4 veces,
 * assess 2) y salia todo de golpe en una unica corrida. Una historia evaluada a
 * las 18 esperaba **13 horas** a la seleccion del dia siguiente, el sitio
 * quedaba congelado 23 de cada 24 horas, y el sitemap de noticias mostraba **una
 * sola hora de publicacion**. Reparte el mismo trabajo, no lo duplica: el costo
 * del job es por historia —traduccion e imagen—, no por corrida.
 */
const JOB_SEEDS: Array<{ jobName: string; cronExpression: string; enabled?: boolean }> = [
  // --- Pipeline --- (todas las horas son de Chile; ver la nota de arriba)
  { jobName: 'crawl_feeds',             cronExpression: '0 */6 * * *' },
  { jobName: 'preassess_stories',       cronExpression: '0 4,10,16,22 * * *' },
  { jobName: 'assess_stories',          cronExpression: '0 6,18 * * *' },
  { jobName: 'select_stories',          cronExpression: '0 7,19 * * *' },
  { jobName: 'publish_stories',         cronExpression: '0 8,20 * * *' },
  // --- Social ---
  // Dos franjas, y ya estaba asi en produccion antes de tocar nada: el 7-sep se
  // leyo la base y decia `0 9,18`, no lo que este archivo declaraba. Alguien lo
  // habia escalonado desde el panel y el seed nunca se entero — `update: {}`.
  // Se copia el valor real en vez de imponer otro.
  //
  // No repite posts: los candidatos excluyen lo ya posteado en cada canal
  // (socialMedia.ts, `findAutoPostCandidates`).
  { jobName: 'social_auto_post',        cronExpression: '0 6,15 * * *' },
  { jobName: 'bluesky_update_metrics',  cronExpression: '0 */6 * * *' },
  { jobName: 'mastodon_update_metrics', cronExpression: '0 1 * * *' },
  { jobName: 'instagram_update_metrics',cronExpression: '0 */6 * * *' },
  { jobName: 'linkedin_update_metrics', cronExpression: '0 */6 * * *' },
  { jobName: 'facebook_update_metrics', cronExpression: '0 */6 * * *' },
  // Vigilancia de tokens — habilitados por defecto: son lo que evita que el
  // posteo vuelva a caerse en silencio. Instagram renueva solo; LinkedIn no
  // puede (solo partners MDP), así que su job avisa para reautorizar a mano.
  { jobName: 'instagram_refresh_token', cronExpression: '30 2 * * *', enabled: true },
  { jobName: 'linkedin_check_token',    cronExpression: '0 3 * * *',  enabled: true },
  // Facebook tampoco renueva solo: media hora después del de LinkedIn.
  { jobName: 'facebook_check_token',    cronExpression: '30 3 * * *', enabled: true },
  // --- Newsletter ---
  // generate_newsletter: miércoles y sábados 1 AM (2× por semana — genera Jue y Lun)
  { jobName: 'generate_newsletter',       cronExpression: '0 1 * * 3,6' },
  // send_newsletter: lunes y jueves 9 AM
  { jobName: 'send_newsletter',           cronExpression: '0 9 * * 1,4' },
  // send_private_newsletter: lunes y jueves 9:30 AM (offset para no solapar)
  { jobName: 'send_private_newsletter',   cronExpression: '30 9 * * 1,4' },
  // send_weekly_newsletter: lunes 6 AM — resumen semana anterior
  { jobName: 'send_weekly_newsletter',    cronExpression: '0 6 * * 1',  enabled: true },
  // send_community_digest: lunes 5 AM — enabled by default
  { jobName: 'send_community_digest',     cronExpression: '0 5 * * 1',  enabled: true },
  // send_alerts: diario 6 AM — enabled by default
  { jobName: 'send_alerts',               cronExpression: '0 6 * * *',  enabled: true },
  // --- Content ---
  // generate_editorial: domingos 2 AM (antes del lunes)
  { jobName: 'generate_editorial',  cronExpression: '0 2 * * 0' },
  // scrape_docip: diario 11 PM (baja carga horaria)
  { jobName: 'scrape_docip',        cronExpression: '0 23 * * *' },
  // ingest_agenda: diario 1 AM — pobla "Incidencia Internacional" desde RSS/iCal
  { jobName: 'ingest_agenda',       cronExpression: '0 1 * * *',  enabled: true },
  // --- Data retention (Ley 21.719) — enabled by default ---
  // cleanup_auth_data: diario medianoche — purga refresh tokens y magic links expirados
  { jobName: 'cleanup_auth_data',      cronExpression: '0 0 * * *',  enabled: true },
  // cleanup_subscriptions: diario 00:30 — purga opt-ins no confirmados expirados y
  // reconcilia las bajas del boletin con el proveedor de correo
  { jobName: 'cleanup_subscriptions',  cronExpression: '30 0 * * *', enabled: true },
]

async function main() {
  const results = await Promise.all(
    JOB_SEEDS.map(({ jobName, cronExpression, enabled = false }) =>
      // `update: {}` a proposito: este seed NO pisa lo que ya esta en la base.
      // Los horarios vivos se editan desde el panel de admin, que ademas
      // reprograma en caliente (`reloadJob`). Cambiar este archivo solo afecta a
      // los jobs que aun no existen — un entorno nuevo, o un job recien
      // agregado.
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
