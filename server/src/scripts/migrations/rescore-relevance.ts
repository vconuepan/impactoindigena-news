/**
 * Re-score the relevance of published stories with the recalibrated assess prompt.
 * Updates ONLY the relevance fields (relevance, relevanceCalculation, relevanceReasons,
 * antifactors, relevanceSummary) — NEVER status or editorial copy (title/summary/quote)
 * and never the embedding. Fixes the compressed 5-6 distribution after recalibration.
 *
 * Usage (always validate with --dry-run on a sample first; runs LLM on Azure = costs money):
 *   npm run migration:rescore-relevance --prefix server -- --dry-run --limit 20   # sample, NO writes
 *   npm run migration:rescore-relevance --prefix server -- --limit 20             # write a 20-story sample
 *   npm run migration:rescore-relevance --prefix server -- --filter=compressed    # only relevance 5-6
 *   npm run migration:rescore-relevance --prefix server                           # full backfill (all published)
 */
import prisma from '../../lib/prisma.js'
import { Semaphore } from '../../lib/semaphore.js'
import { config } from '../../config.js'
import { rescoreStory } from '../../services/analysis.js'

const DRY_RUN = process.argv.includes('--dry-run')

function parseLimit(): number | undefined {
  const eq = process.argv.find((a) => a.startsWith('--limit='))
  if (eq) return parseInt(eq.split('=')[1], 10)
  const idx = process.argv.indexOf('--limit')
  if (idx >= 0 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10)
  return undefined
}
const LIMIT = parseLimit()
const FILTER = process.argv.find((a) => a.startsWith('--filter='))?.split('=')[1] ?? 'all'
const COMPRESSED_ONLY = FILTER === 'compressed'

function distribution(values: (number | null)[]): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const v of values) {
    const k = v == null ? 'null' : String(v)
    dist[k] = (dist[k] ?? 0) + 1
  }
  return dist
}

async function main() {
  const where = {
    status: 'published' as const,
    ...(COMPRESSED_ONLY ? { relevance: { gte: 5, lte: 6 } } : {}),
  }
  const stories = await prisma.story.findMany({
    where,
    select: { id: true, relevance: true },
    orderBy: { datePublished: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  })

  console.log(
    `Re-scoring ${stories.length} stories (filter=${FILTER}${LIMIT ? `, limit=${LIMIT}` : ''}, dryRun=${DRY_RUN})`
  )
  console.log('Old distribution:', distribution(stories.map((s) => s.relevance)))

  const semaphore = new Semaphore(config.concurrency.assess)
  const results: { old: number | null; new: number }[] = []
  let done = 0
  let failed = 0

  await Promise.allSettled(
    stories.map((s) =>
      semaphore.run(async () => {
        try {
          const r = await rescoreStory(s.id, { dryRun: DRY_RUN })
          results.push({ old: r.oldRelevance, new: r.newRelevance })
          done++
          if (done % 25 === 0) console.log(`  ...${done}/${stories.length}`)
        } catch (err) {
          failed++
          console.error(`  Failed ${s.id}:`, err instanceof Error ? err.message : err)
        }
      })
    )
  )

  console.log(`\nDone. Rescored: ${done}, Failed: ${failed}`)
  console.log('New distribution:', distribution(results.map((r) => r.new)))
  const up = results.filter((r) => r.old != null && r.new > r.old).length
  const down = results.filter((r) => r.old != null && r.new < r.old).length
  const same = results.filter((r) => r.old === r.new).length
  console.log(`Movement: ↑${up}  ↓${down}  =${same}`)
  if (DRY_RUN) console.log('DRY RUN — no changes written.')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
