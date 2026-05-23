/**
 * cleanup-feeds-2.ts — segunda pasada para los 4 casos no resueltos
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  // Mostrar estado actual de los 4 problemáticos
  const checks = [
    { label: 'Amnesty', search: 'amnesty' },
    { label: 'CCIB',    search: 'ccib' },
    { label: 'Climate Home', search: 'climatechange' },
    { label: 'UN News Human Rights EN', search: 'subscribe/en/news/topic/human-rights' },
  ]

  for (const c of checks) {
    const feeds = await prisma.feed.findMany({
      where: { rssUrl: { contains: c.search, mode: 'insensitive' } },
      include: { _count: { select: { stories: true } } },
      orderBy: { stories: { _count: 'desc' } },
    })
    console.log(`\n${c.label} (${feeds.length} feeds):`)
    for (const f of feeds) {
      console.log(`  [${f._count.stories.toString().padStart(3)} stories] id:${f.id}  "${f.title}"`)
      console.log(`  url: "${f.rssUrl}"`)
    }
  }

  // ── Aplicar los 4 fixes ─────────────────────────────────────────────────

  // 1. Amnesty: puede haber un tercero con www.amnesty.org/en/feed/
  const amnestyAll = await prisma.feed.findMany({
    where: { rssUrl: { contains: 'amnesty', mode: 'insensitive' } },
    include: { _count: { select: { stories: true } } },
    orderBy: { stories: { _count: 'desc' } },
  })
  const amnestyKeep = amnestyAll[0]
  const amnestyDrop = amnestyAll.slice(1)
  if (amnestyDrop.length > 0 && amnestyKeep) {
    for (const drop of amnestyDrop) {
      if (drop._count.stories > 0) {
        await prisma.story.updateMany({ where: { feedId: drop.id }, data: { feedId: amnestyKeep.id } })
        console.log(`\n✅ Amnesty: reasignadas ${drop._count.stories} stories → keeper`)
      }
      await prisma.feed.delete({ where: { id: drop.id } })
      console.log(`✅ Amnesty: eliminado "${drop.title}" (${drop.id})`)
    }
  }

  // 2. CCIB: mismo URL, quedar con el que tiene más stories
  const ccibAll = await prisma.feed.findMany({
    where: { rssUrl: { contains: 'ccib', mode: 'insensitive' } },
    include: { _count: { select: { stories: true } } },
    orderBy: { stories: { _count: 'desc' } },
  })
  if (ccibAll.length > 1) {
    const ccibKeep = ccibAll[0]
    for (const drop of ccibAll.slice(1)) {
      if (drop._count.stories > 0) {
        await prisma.story.updateMany({ where: { feedId: drop.id }, data: { feedId: ccibKeep.id } })
        console.log(`\n✅ CCIB: reasignadas ${drop._count.stories} stories → keeper`)
      }
      await prisma.feed.delete({ where: { id: drop.id } })
      console.log(`✅ CCIB: eliminado duplicado (${drop.id})`)
    }
  }

  // 3. Climate Home News: quedar con el que tiene más stories
  const climateAll = await prisma.feed.findMany({
    where: { rssUrl: { contains: 'climatechange', mode: 'insensitive' } },
    include: { _count: { select: { stories: true } } },
    orderBy: { stories: { _count: 'desc' } },
  })
  if (climateAll.length > 1) {
    const climateKeep = climateAll[0]
    for (const drop of climateAll.slice(1)) {
      if (drop._count.stories > 0) {
        await prisma.story.updateMany({ where: { feedId: drop.id }, data: { feedId: climateKeep.id } })
        console.log(`\n✅ Climate Home: reasignadas ${drop._count.stories} stories → keeper`)
      }
      await prisma.feed.delete({ where: { id: drop.id } })
      console.log(`✅ Climate Home: eliminado duplicado (${drop.id})`)
    }
  }

  // 4. UN News Human Rights EN: quedar con el que tiene más stories
  const unAll = await prisma.feed.findMany({
    where: { rssUrl: { contains: 'subscribe/en/news/topic/human-rights', mode: 'insensitive' } },
    include: { _count: { select: { stories: true } } },
    orderBy: { stories: { _count: 'desc' } },
  })
  if (unAll.length > 1) {
    const unKeep = unAll[0]
    for (const drop of unAll.slice(1)) {
      if (drop._count.stories > 0) {
        await prisma.story.updateMany({ where: { feedId: drop.id }, data: { feedId: unKeep.id } })
        console.log(`\n✅ UN Human Rights EN: reasignadas ${drop._count.stories} stories → keeper`)
      }
      await prisma.feed.delete({ where: { id: drop.id } })
      console.log(`✅ UN Human Rights EN: eliminado duplicado (${drop.id})`)
    }
  }

  const remaining = await prisma.feed.count()
  console.log(`\n✅ Feeds restantes: ${remaining}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
