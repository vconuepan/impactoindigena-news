/**
 * Verifica cuántos de los feeds activos tienen snapshots en el Wayback Machine
 * para enero y febrero 2026. Quick check antes de hacer el backfill completo.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

async function checkFeed(rssUrl: string, from: string, to: string): Promise<number> {
  try {
    const params = new URLSearchParams({
      url: rssUrl,
      output: 'json',
      from,
      to,
      limit: '5',
      fl: 'timestamp',
      filter: 'statuscode:200',
      collapse: 'timestamp:8', // one per day
    })
    const { data } = await axios.get(
      `http://web.archive.org/cdx/search/cdx?${params}`,
      { timeout: 8000 }
    )
    if (!Array.isArray(data) || data.length <= 1) return 0
    return data.length - 1 // first row is header
  } catch {
    return -1 // error
  }
}

async function main() {
  const feeds = await prisma.feed.findMany({
    where: { active: true, rssUrl: { not: '' } },
    select: { title: true, rssUrl: true },
    take: 30,
  })

  console.log(`\n🔍 Verificando cobertura Wayback Machine para ${feeds.length} feeds...\n`)

  let covered = 0, missing = 0, errors = 0

  for (const feed of feeds) {
    if (!feed.rssUrl) continue
    const jan = await checkFeed(feed.rssUrl, '20260101', '20260201')
    const feb = await checkFeed(feed.rssUrl, '20260201', '20260301')
    const status = jan > 0 || feb > 0 ? '✅' : jan === -1 ? '❌' : '○'
    if (jan > 0 || feb > 0) covered++
    else if (jan === -1) errors++
    else missing++
    console.log(`${status} ${feed.title?.slice(0,45).padEnd(45)} Jan:${jan < 0 ? 'err' : jan}  Feb:${feb < 0 ? 'err' : feb}`)
    await new Promise(r => setTimeout(r, 300)) // rate limit
  }

  console.log(`\n✅ Con cobertura: ${covered}  ○ Sin snapshots: ${missing}  ❌ Errores: ${errors}\n`)
  await prisma.$disconnect()
}

main().catch(console.error)
