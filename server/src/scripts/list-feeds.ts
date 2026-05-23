import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const feeds = await prisma.feed.findMany({
    orderBy: { lastSuccessfulCrawlAt: { sort: 'asc', nulls: 'first' } },
    include: { _count: { select: { stories: true } } }
  })

  console.log(`Total feeds: ${feeds.length}\n`)
  for (const f of feeds) {
    const lastSuccess = f.lastSuccessfulCrawlAt ? f.lastSuccessfulCrawlAt.toISOString().slice(0,10) : 'NUNCA'
    const lastCrawl   = f.lastCrawledAt         ? f.lastCrawledAt.toISOString().slice(0,10)         : 'NUNCA'
    const status = f.active ? 'ON ' : 'OFF'
    console.log(`[${status}] ${(f.title ?? '').padEnd(48)} stories:${String(f._count.stories).padStart(4)}  éxito:${lastSuccess}  crawl:${lastCrawl}`)
    console.log(`       ${f.rssUrl?.slice(0,90)}`)
    console.log()
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
