/**
 * Redacta la nota con claves para noticias YA publicadas que no la tienen
 * (plan del 25-oct-2026, B2). Las nuevas la reciben al publicar; este script
 * cubre las anteriores, de la más reciente hacia atrás.
 *
 * Simula por defecto: lista cuántas y cuáles, sin llamar al modelo. Con
 * `--apply` redacta. `--limit N` acota (entero, 0 o más; otro valor aborta:
 * lección de backfill-translations, donde `--limit=20` traducía todo).
 *
 *   npx tsx src/scripts/backfill-story-bodies.ts --limit 20
 *   npx tsx src/scripts/backfill-story-bodies.ts --limit 20 --apply
 *
 * Costo medido en A1: US$0,0013-0,0025 por nota con gpt-4.1-mini.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { draftStoryBody } from '../services/storyBody.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const limitIdx = args.indexOf('--limit')
let LIMIT = 50
if (limitIdx >= 0) {
  const n = Number(args[limitIdx + 1])
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--limit tiene que ser un entero de 0 o más; llegó «${args[limitIdx + 1]}»`)
    process.exit(1)
  }
  LIMIT = n
}
for (const a of args) {
  if (a.startsWith('--limit=')) {
    console.error('Usa «--limit N» con espacio; «--limit=N» no se acepta')
    process.exit(1)
  }
}

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const sinCuerpo = await prisma.story.findMany({
    where: { status: 'published', body: null },
    orderBy: { datePublished: 'desc' },
    take: LIMIT,
    select: { id: true, slug: true, datePublished: true, sourceUrl: true, sourceContent: true },
  })
  const total = await prisma.story.count({ where: { status: 'published', body: null } })
  console.log(`${total} publicadas sin nota con claves; se toman ${sinCuerpo.length} (${APPLY ? 'REDACTANDO' : 'simulación, sin modelo'})`)

  const cuenta = { saved: 0, blocked: 0, skipped: 0, failed: 0 }
  for (const s of sinCuerpo) {
    const chars = s.sourceContent?.length ?? 0
    if (!APPLY) {
      console.log(`- ${s.datePublished?.toISOString().slice(0, 10)} ${s.slug} (${chars} caracteres${/news\.google\./.test(s.sourceUrl) ? ', Google News' : ''})`)
      continue
    }
    const r = await draftStoryBody(s.id)
    cuenta[r.outcome]++
    const detalle = r.outcome === 'saved' ? `${r.words} palabras, ${r.avisos.length} avisos` : r.outcome === 'blocked' ? r.avisos.filter((a) => a.tipo !== 'largo').map((a) => a.tipo).join(',') : r.reason
    console.log(`- ${s.slug}: ${r.outcome} (${detalle})`)
  }
  if (APPLY) console.log(cuenta)
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
