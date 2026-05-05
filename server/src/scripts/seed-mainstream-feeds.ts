/**
 * seed-mainstream-feeds.ts
 *
 * Inserts mainstream international media feeds with feedCategory = 'MAINSTREAM'.
 * These feeds get crawled and scored by the standard LLM relevance pipeline,
 * allowing the Compare page to show real relevance data vs indigenous-focused sources.
 *
 * Usage:
 *   npx tsx src/scripts/seed-mainstream-feeds.ts
 *
 * Idempotent — skips feeds that already exist (matched by rssUrl).
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const prisma = new PrismaClient()

// Assigned to 'derechos-indigenas' so stories flow through the indigenous rights
// issue pipeline and get scored for indigenous relevance.
const ISSUE_ID = 'issue-ddhh-002'

const MAINSTREAM_FEEDS = [
  {
    title: 'BBC World News',
    rssUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    url: 'https://www.bbc.com/news/world',
    language: 'en',
    region: 'global' as const,
    crawlIntervalHours: 6,
  },
  {
    title: 'Al Jazeera English',
    rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    url: 'https://www.aljazeera.com',
    language: 'en',
    region: 'global' as const,
    crawlIntervalHours: 6,
  },
  {
    title: 'Deutsche Welle (English)',
    rssUrl: 'https://rss.dw.com/xml/rss-en-world',
    url: 'https://www.dw.com/en/top-stories/s-9097',
    language: 'en',
    region: 'western_europe' as const,
    crawlIntervalHours: 6,
  },
  {
    title: 'Der Spiegel International',
    rssUrl: 'https://www.spiegel.de/international/index.rss',
    url: 'https://www.spiegel.de/international',
    language: 'en',
    region: 'western_europe' as const,
    crawlIntervalHours: 12,
  },
  {
    title: 'Le Monde (English)',
    rssUrl: 'https://www.lemonde.fr/en/rss/une.xml',
    url: 'https://www.lemonde.fr/en',
    language: 'en',
    region: 'western_europe' as const,
    crawlIntervalHours: 12,
  },
  {
    title: 'El País (English)',
    rssUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada',
    url: 'https://english.elpais.com',
    language: 'en',
    region: 'western_europe' as const,
    crawlIntervalHours: 12,
  },
]

async function main() {
  console.log('Seeding mainstream feeds...\n')

  let created = 0
  let skipped = 0

  for (const feed of MAINSTREAM_FEEDS) {
    const existing = await prisma.feed.findUnique({ where: { rssUrl: feed.rssUrl } })

    if (existing) {
      console.log(`  SKIP  ${feed.title} (already exists)`)
      skipped++
      continue
    }

    await prisma.feed.create({
      data: {
        ...feed,
        issueId: ISSUE_ID,
        feedCategory: 'MAINSTREAM',
        active: true,
      },
    })

    console.log(`  OK    ${feed.title}`)
    created++
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
}

main()
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
