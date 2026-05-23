import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Check analyzed stories - when were they last updated?
const analyzed = await prisma.story.findMany({
  where: { status: 'analyzed' },
  select: { id: true, sourceTitle: true, updatedAt: true, sourceDatePublished: true },
  orderBy: { updatedAt: 'desc' },
  take: 10,
})
console.log(`Total analyzed: ${analyzed.length} (showing last 10 by updatedAt)\n`)
analyzed.forEach(s => console.log(
  s.updatedAt.toISOString().slice(0, 16),
  s.sourceDatePublished?.toISOString().slice(0, 10) ?? 'no-date',
  s.sourceTitle?.slice(0, 60)
))

// Also check selected
const selected = await prisma.story.count({ where: { status: 'selected' } })
console.log(`\nSelected (ready to publish): ${selected}`)
await prisma.$disconnect()
