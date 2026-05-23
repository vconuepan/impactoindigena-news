/**
 * backfill-wayback.ts
 *
 * Recupera artículos históricos usando el Wayback Machine.
 *
 * Para cada feed activo:
 *   1. Consulta el CDX API de Wayback Machine para snapshots de los periodos indicados
 *   2. Descarga cada snapshot del RSS archivado
 *   3. Parsea los items y extrae el contenido (desde URL original o desde Wayback)
 *   4. Inserta las historias nuevas en la DB con status "fetched"
 *
 * Uso:
 *   npx tsx src/scripts/backfill-wayback.ts                 # enero + febrero + 1-6 marzo 2026
 *   npx tsx src/scripts/backfill-wayback.ts --from 20260101 --to 20260201  # solo enero
 *   npx tsx src/scripts/backfill-wayback.ts --dry-run        # solo mostrar qué haría
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import Parser from 'rss-parser'
import { extractContent } from '../services/extractor.js'
import { getExistingUrls, createStory } from '../services/story.js'
import { normalizeUrl } from '../utils/urlNormalization.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('backfill-wayback')
const prisma = new PrismaClient()
const rssParser = new Parser()

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const fromArg = args[args.indexOf('--from') + 1]
const toArg   = args[args.indexOf('--to') + 1]

// Default: enero 1 → marzo 7, 2026 (before our first story)
const FROM_DATE = fromArg ?? '20260101'
const TO_DATE   = toArg   ?? '20260307'

// ── Constants ─────────────────────────────────────────────────────────────────
const CDX_API       = 'http://web.archive.org/cdx/search/cdx'
const WAYBACK_BASE  = 'https://web.archive.org/web'
const CDX_DELAY_MS  = 400   // between CDX queries
const FETCH_DELAY_MS = 600  // between article fetches
const MAX_SNAPSHOTS_PER_FEED = 8  // spread across the period

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/** Get Wayback Machine snapshot timestamps for a URL in a date range */
async function getSnapshots(url: string, from: string, to: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      url,
      output: 'json',
      from,
      to,
      fl: 'timestamp',
      filter: 'statuscode:200',
      collapse: 'timestamp:8', // one per day
      limit: String(MAX_SNAPSHOTS_PER_FEED),
    })
    const { data } = await axios.get(`${CDX_API}?${params}`, { timeout: 10_000 })
    if (!Array.isArray(data) || data.length <= 1) return []
    return (data.slice(1) as string[][]).map(row => row[0])
  } catch {
    return []
  }
}

/** Fetch an archived RSS snapshot and return parsed items */
async function fetchArchivedRss(rssUrl: string, timestamp: string): Promise<Array<{
  url: string
  title: string
  datePublished: Date | null
  imageUrl: string | null
}>> {
  const archivedUrl = `${WAYBACK_BASE}/${timestamp}/${rssUrl}`
  try {
    const { data: xml } = await axios.get<string>(archivedUrl, {
      timeout: 15_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; backfill-bot/1.0)' },
      responseType: 'text',
    })
    const feed = await rssParser.parseString(xml)
    return feed.items.map(item => {
      // Wayback Machine rewrites URLs in the feed — extract the original
      const rawLink = item.link || item.guid || ''
      const originalUrl = extractOriginalUrl(rawLink)
      let datePublished: Date | null = null
      if (item.isoDate || item.pubDate) {
        const d = new Date(item.isoDate ?? item.pubDate!)
        if (!isNaN(d.getTime())) datePublished = d
      }
      return {
        url: originalUrl,
        title: (item.title ?? '').trim(),
        datePublished,
        imageUrl: (item as Record<string, unknown>)['media:content']
          ? String((item as Record<string, unknown>)['media:content'])
          : null,
      }
    }).filter(i => i.url.startsWith('http'))
  } catch {
    return []
  }
}

/** Wayback Machine rewrites links in archived pages/feeds.
 *  Strip the /web/TIMESTAMP/ prefix to get the original URL. */
function extractOriginalUrl(url: string): string {
  const match = url.match(/web\.archive\.org\/web\/\d+\/(.+)$/)
  if (match) return match[1]
  return url
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🕰️  Wayback Machine Backfill`)
  console.log(`   Periodo: ${FROM_DATE} → ${TO_DATE}`)
  if (DRY_RUN) console.log(`   🔍 DRY RUN — no se escribirá nada en la DB`)
  console.log()

  const feeds = await prisma.feed.findMany({
    where: { active: true, rssUrl: { not: '' } },
    select: { id: true, title: true, rssUrl: true },
    orderBy: { title: 'asc' },
  })
  console.log(`📡 Feeds activos: ${feeds.length}\n`)

  let totalNew = 0
  let totalSkipped = 0
  let totalErrors = 0
  let feedsWithData = 0

  for (const feed of feeds) {
    if (!feed.rssUrl) continue

    process.stdout.write(`⏳ ${feed.title?.slice(0, 50).padEnd(50)} `)

    // 1. Get snapshots from CDX
    await sleep(CDX_DELAY_MS)
    const snapshots = await getSnapshots(feed.rssUrl, FROM_DATE, TO_DATE)

    if (snapshots.length === 0) {
      console.log(`— sin snapshots`)
      continue
    }
    console.log(`${snapshots.length} snapshots`)
    feedsWithData++

    // 2. For each snapshot, fetch archived RSS and collect items
    const allItems: Array<{ url: string; title: string; datePublished: Date | null; imageUrl: string | null }> = []
    for (const timestamp of snapshots) {
      await sleep(FETCH_DELAY_MS)
      const items = await fetchArchivedRss(feed.rssUrl, timestamp)
      allItems.push(...items)
    }

    // 3. Deduplicate URLs within this batch
    const seenUrls = new Set<string>()
    const uniqueItems = allItems
      .map(item => ({ ...item, url: normalizeUrl(item.url) }))
      .filter(item => {
        if (!item.url || seenUrls.has(item.url)) return false
        seenUrls.add(item.url)
        return true
      })

    if (uniqueItems.length === 0) {
      console.log(`     → 0 artículos únicos`)
      continue
    }

    // 4. Filter out URLs already in DB
    const existingUrls = await getExistingUrls(uniqueItems.map(i => i.url))
    const newItems = uniqueItems.filter(i => !existingUrls.has(i.url))
    totalSkipped += uniqueItems.length - newItems.length

    console.log(`     → ${uniqueItems.length} artículos únicos, ${newItems.length} nuevos, ${uniqueItems.length - newItems.length} ya existen`)

    if (newItems.length === 0 || DRY_RUN) continue

    // 5. Extract content and insert stories
    for (const item of newItems) {
      try {
        await sleep(300)
        const extracted = await extractContent(item.url, {})
        if (!extracted) {
          log.debug({ url: item.url }, 'no content extracted')
          totalErrors++
          continue
        }

        await createStory({
          sourceUrl: item.url,
          sourceTitle: extracted.title || item.title,
          sourceContent: extracted.content,
          feedId: feed.id,
          sourceDatePublished: item.datePublished || undefined,
          crawlMethod: extracted.method,
          imageUrl: item.imageUrl || null,
        })

        totalNew++
        process.stdout.write('.')
      } catch (err: unknown) {
        const e = err as { code?: string }
        if (e?.code === 'P2002') {
          totalSkipped++ // concurrent duplicate
        } else {
          log.debug({ url: item.url, err }, 'insert failed')
          totalErrors++
        }
      }
    }
    console.log()
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📊 Resumen:`)
  console.log(`   Feeds con snapshots: ${feedsWithData}`)
  console.log(`   Historias nuevas:    ${totalNew}`)
  console.log(`   Duplicadas omitidas: ${totalSkipped}`)
  console.log(`   Errores extracción:  ${totalErrors}`)
  console.log()
  if (totalNew > 0) {
    console.log(`✅ Listo. Próximo paso:`)
    console.log(`   1. Correr el pipeline de assessmento (preassess → assess → publish)`)
    console.log(`   2. Crear newsletters de enero y febrero desde el admin`)
  } else if (DRY_RUN) {
    console.log(`ℹ️  Dry run completado — corre sin --dry-run para insertar`)
  } else {
    console.log(`⚠️  No se encontraron artículos nuevos en el periodo ${FROM_DATE}–${TO_DATE}`)
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('❌', err.message || err)
  process.exit(1)
})
