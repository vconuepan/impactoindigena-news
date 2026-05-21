/**
 * setup-google-news-feed.ts
 *
 * Crea el feed virtual de Google News en la base de datos.
 * Ejecutar UNA VEZ antes de activar el job `google_news_discover`.
 *
 *   npx tsx --env-file=.env src/scripts/setup-google-news-feed.ts
 *
 * Idempotente: si el feed ya existe, solo muestra su ID.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { GOOGLE_NEWS_VIRTUAL_RSS } from '../jobs/googleNewsDiscover.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  // Verificar si ya existe
  const existing = await prisma.feed.findFirst({
    where: { rssUrl: GOOGLE_NEWS_VIRTUAL_RSS },
  })

  if (existing) {
    console.log('✅ Google News virtual feed ya existe:')
    console.log(`   ID    : ${existing.id}`)
    console.log(`   Título: ${existing.title}`)
    console.log(`   Activo: ${existing.active}`)
    return
  }

  // Usar el primer issue disponible como dueño del feed
  const issue = await prisma.issue.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })

  if (!issue) {
    console.error('❌ No se encontró ningún Issue en la DB. Crea al menos uno primero.')
    process.exit(1)
  }

  const feed = await prisma.feed.create({
    data: {
      title: 'Google News — Búsqueda Indígena',
      rssUrl: GOOGLE_NEWS_VIRTUAL_RSS,
      url: 'https://news.google.com',
      displayTitle: 'Google News',
      language: 'es',
      issueId: issue.id,
      active: true,
      crawlIntervalHours: 8,
    },
  })

  // Registrar el job en la tabla JobRun si no existe
  const existingJob = await prisma.jobRun.findUnique({
    where: { jobName: 'google_news_discover' },
  })

  if (!existingJob) {
    await prisma.jobRun.create({
      data: {
        jobName: 'google_news_discover',
        cronExpression: '0 */8 * * *',
        enabled: true,
      },
    })
    console.log('✅ Job google_news_discover registrado (cada 8 horas)')
  } else {
    console.log('ℹ️  Job google_news_discover ya existía en JobRun')
  }

  console.log('\n✅ Feed virtual creado:')
  console.log(`   ID    : ${feed.id}`)
  console.log(`   Título: ${feed.title}`)
  console.log(`   Issue : ${issue.name} (${issue.id})`)
  console.log('\n🚀 Listo. El job se activará en el próximo reinicio del servidor.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
