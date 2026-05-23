/**
 * Regenerate HTML for all main "Impacto Indígena" newsletters that have content.
 * Skips specialty newsletters ([PRIVADO], [CLPI], [ACUICULTURA], [CHILE INDÍGENA], Week XX).
 *
 * Usage: npx tsx src/scripts/regenerate-html.ts
 * Add --all to also regenerate specialty newsletters.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ALL = process.argv.includes('--all')

const SKIP_PREFIXES = ['[PRIVADO]', '[CLPI]', '[ACUICULTURA]', '[CHILE INDÍGENA]', 'Week ']

async function main() {
  const newsletters = await prisma.newsletter.findMany({
    where: { content: { not: '' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, createdAt: true },
  })

  const targets = ALL
    ? newsletters
    : newsletters.filter(n => !SKIP_PREFIXES.some(p => n.title.startsWith(p)))

  console.log(`\n🔄 Regenerando HTML para ${targets.length} newsletters (de ${newsletters.length} con contenido)\n`)

  const { generateHtmlContent } = await import('../services/newsletter.js')

  let ok = 0
  let fail = 0

  for (const n of targets) {
    const label = `${n.createdAt.toISOString().slice(0, 10)} — ${n.title}`
    try {
      const html = await generateHtmlContent(n.id)
      console.log(`  ✅ ${label} (${html.length.toLocaleString()} chars)`)
      ok++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ❌ ${label}: ${msg}`)
      fail++
    }
  }

  console.log(`\n✅ ${ok} regenerados  ❌ ${fail} errores\n`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('❌ Error:', err.message || err)
  process.exit(1)
})
