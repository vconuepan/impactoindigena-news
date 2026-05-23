/**
 * cleanup-feeds.ts
 *
 * Limpia feeds duplicados y los Google News RSS individuales obsoletos.
 * Los duplicados con stories reasignan sus stories al feed principal antes de eliminar.
 *
 * Ejecutar: npx tsx --env-file=.env src/scripts/cleanup-feeds.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  // ─── 1. Google News RSS individuales obsoletos ───────────────────────────
  // Todos OFF, 0 stories. Reemplazados por el job google_news_discover.
  const OLD_GOOGLE_NEWS_PATTERNS = [
    'pueblos+ind%C3%ADgenas+Per%C3%BA',
    'q=mapuche&',
    'UNPFII+%22pueblos',
    'pueblos+ind%C3%ADgenas+Bolivia',
    'q=%22convenio+169%22',
    '%22foro+permanente%22',
    'Tribunal+Constitucional+CONADI',
    'q=CONADI&',
    '%22pueblo+mapuche%22',
    'pueblos+ind%C3%ADgenas+M%C3%A9xico',
    'pueblos+ind%C3%ADgenas+Chile',
  ]

  const googleNewsFeeds = await prisma.feed.findMany({
    where: {
      rssUrl: { contains: 'news.google.com/rss/search?q=' },
    },
    include: { _count: { select: { stories: true } } },
  })

  const toDeleteGN = googleNewsFeeds.filter(f =>
    OLD_GOOGLE_NEWS_PATTERNS.some(p => f.rssUrl?.includes(p))
  )

  console.log(`\n── Google News RSS individuales a eliminar (${toDeleteGN.length}) ──`)
  for (const f of toDeleteGN) {
    console.log(`  [${f._count.stories} stories] ${f.title}`)
  }

  // ─── 2. Duplicados ────────────────────────────────────────────────────────
  // Cada entrada: { keepUrl, dropUrl } — los stories del dropUrl se reasignan al keepUrl.
  // Para feeds con 0 stories en el drop, la reasignación es no-op.
  const DUPLICATES: Array<{ keepUrl: string; dropUrl: string; label: string }> = [
    // Indian Country Today
    {
      label: 'Indian Country Today',
      keepUrl: 'https://ictnews.org/feed/',
      dropUrl: 'https://ictnews.org/feed',
    },
    // Mongabay
    {
      label: 'Mongabay (en)',
      keepUrl: 'https://news.mongabay.com/feed/',
      dropUrl: 'https://news.mongabay.com/feed',
    },
    // Amnesty International — drop the smaller two
    {
      label: 'Amnesty (latest/news/feed)',
      keepUrl: 'https://www.amnesty.org/en/feed/',
      dropUrl: 'https://www.amnesty.org/en/latest/news/feed/',
    },
    {
      label: 'Amnesty (duplicate /en/feed/ with 46)',
      keepUrl: 'https://www.amnesty.org/en/feed/',   // kept: the one with 97 stories
      dropUrl: 'https://amnesty.org/en/feed/',        // drop: the one with 46 (different www prefix)
    },
    // Guardian Environment
    {
      label: 'Guardian Environment',
      keepUrl: 'https://www.theguardian.com/environment/rss',
      dropUrl: 'https://theguardian.com/environment/rss',
    },
    // Human Rights Watch
    {
      label: 'Human Rights Watch',
      keepUrl: 'https://www.hrw.org/rss',
      dropUrl: 'https://www.hrw.org/rss/news',
    },
    // CCIB
    {
      label: 'CCIB',
      keepUrl: 'https://www.ccib.ca/feed/',
      dropUrl:  'https://www.ccib.ca/feed/',   // same URL, need to handle by title/stories count
    },
    // Climate Home News
    {
      label: 'Climate Home News',
      keepUrl: 'https://climatechangenews.com/feed',
      dropUrl: 'https://www.climatechangenews.com/feed/',
    },
    // UN News Human Rights (EN) — two feeds with exact same URL
    {
      label: 'UN News Human Rights (EN) duplicate',
      keepUrl: 'https://news.un.org/feed/subscribe/en/news/topic/human-rights/feed/rss.xml ',
      dropUrl: 'https://news.un.org/feed/subscribe/en/news/topic/human-rights/feed/rss.xml',
    },
    // Survival International
    {
      label: 'Survival International',
      keepUrl: 'https://www.survivalinternational.org/news.rss',
      dropUrl: 'https://www.survivalinternational.org/news/rss',
    },
    // NACLA (0 stories duplicate)
    {
      label: 'NACLA',
      keepUrl: 'https://nacla.org/feed/',
      dropUrl: 'https://nacla.org/feed',
    },
  ]

  // ─── Dry-run: mostrar plan ────────────────────────────────────────────────
  console.log(`\n── Duplicados a limpiar (${DUPLICATES.length}) ──`)

  type DupPlan = {
    label: string
    keepId: string
    dropId: string
    dropStories: number
  }
  const dupPlans: DupPlan[] = []

  for (const dup of DUPLICATES) {
    // Find keep feed
    const keepFeed = await prisma.feed.findFirst({
      where: { rssUrl: dup.keepUrl },
      include: { _count: { select: { stories: true } } },
      orderBy: { stories: { _count: 'desc' } },
    })
    // Find drop feed — different id from keep
    const dropFeed = await prisma.feed.findFirst({
      where: {
        rssUrl: dup.dropUrl,
        id: keepFeed ? { not: keepFeed.id } : undefined,
      },
      include: { _count: { select: { stories: true } } },
    })

    if (!keepFeed) {
      console.log(`  ⚠ No encontrado KEEP: ${dup.keepUrl}`)
      continue
    }
    if (!dropFeed) {
      console.log(`  ⚠ No encontrado DROP para "${dup.label}" (${dup.dropUrl})`)
      continue
    }

    console.log(`  ${dup.label}`)
    console.log(`    KEEP  [${keepFeed._count.stories} stories] ${keepFeed.title} (${keepFeed.id})`)
    console.log(`    DROP  [${dropFeed._count.stories} stories] ${dropFeed.title} (${dropFeed.id})`)

    dupPlans.push({
      label: dup.label,
      keepId: keepFeed.id,
      dropId: dropFeed.id,
      dropStories: dropFeed._count.stories,
    })
  }

  // ─── Aplicar ──────────────────────────────────────────────────────────────
  console.log('\n── Aplicando limpieza… ──')

  // 1. Eliminar Google News individuales (0 stories, safe delete)
  let deleted = 0
  for (const f of toDeleteGN) {
    await prisma.feed.delete({ where: { id: f.id } })
    deleted++
  }
  console.log(`✅ Google News individuales eliminados: ${deleted}`)

  // 2. Duplicados: reasignar stories → eliminar
  let reassigned = 0
  let dupDeleted = 0
  for (const plan of dupPlans) {
    if (plan.dropStories > 0) {
      const result = await prisma.story.updateMany({
        where: { feedId: plan.dropId },
        data: { feedId: plan.keepId },
      })
      reassigned += result.count
      console.log(`  Reasignadas ${result.count} stories de "${plan.label}"`)
    }
    await prisma.feed.delete({ where: { id: plan.dropId } })
    dupDeleted++
  }
  console.log(`✅ Duplicados eliminados: ${dupDeleted}  (stories reasignadas: ${reassigned})`)

  // ─── Resumen final ────────────────────────────────────────────────────────
  const remaining = await prisma.feed.count()
  console.log(`\n✅ Listo. Feeds restantes: ${remaining}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
