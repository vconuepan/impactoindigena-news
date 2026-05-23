import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const recent = await prisma.story.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  select: { id: true, status: true, createdAt: true, sourceDatePublished: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
})
console.log('Stories created in last 15 min:', recent.length)
recent.forEach(s => console.log(' ', s.status, s.sourceDatePublished?.toISOString()?.slice(0,10) ?? 'no-date', s.createdAt.toISOString().slice(11,19)))

const total = await prisma.story.count()
const fetched = await prisma.story.count({ where: { status: 'fetched' } })
console.log('\nTotal:', total, '| Fetched:', fetched)
await prisma.$disconnect()
