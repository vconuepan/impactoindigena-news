/**
 * run-pipeline.ts
 *
 * Runs the full assessment pipeline on all stories in `fetched` status:
 *   1. preassess_stories  (fetched → pre_analyzed)
 *   2. assess_stories     (pre_analyzed → assessed/rejected)
 *   3. publish_stories    (selected → published)
 *
 * Usage:
 *   npx tsx src/scripts/run-pipeline.ts
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'
import { runPreassessStories } from '../jobs/preassessStories.js'
import { runAssessStories } from '../jobs/assessStories.js'
import { runPublishStories } from '../jobs/publishStories.js'

const prisma = new PrismaClient()

async function countByStatus(status: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.story.count({ where: { status: status as any } })
}

async function main() {
  console.log('\n🔄  Pipeline: preassess → assess → publish')
  console.log(`   Hora: ${new Date().toISOString()}\n`)

  const fetched = await countByStatus('fetched')
  console.log(`📦 Historias en "fetched": ${fetched}`)
  if (fetched === 0) {
    console.log('   (ninguna — pipeline omitido)')
    await prisma.$disconnect()
    return
  }

  // Step 1: Pre-assess
  console.log('\n⏳ Paso 1: Pre-assessment...')
  await runPreassessStories()
  const preAnalyzed = await countByStatus('pre_analyzed')
  console.log(`   ✓ pre_analyzed: ${preAnalyzed}`)

  // Step 2: Assess
  console.log('\n⏳ Paso 2: Assessment...')
  await runAssessStories()
  const assessed = await countByStatus('assessed')
  const selected = await countByStatus('selected')
  const rejected = await countByStatus('rejected')
  console.log(`   ✓ assessed: ${assessed}, selected: ${selected}, rejected: ${rejected}`)

  // Step 3: Publish
  console.log('\n⏳ Paso 3: Publish...')
  await runPublishStories()
  const published = await countByStatus('published')
  console.log(`   ✓ published: ${published}`)

  console.log('\n✅ Pipeline completado.')
  console.log('   Próximo paso: crear newsletters de enero y febrero desde el admin.')

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('❌', err.message || err)
  process.exit(1)
})
