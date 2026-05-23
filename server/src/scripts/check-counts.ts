import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const total = await prisma.story.count()
const fetched = await prisma.story.count({ where: { status: 'fetched' } })
const jan = await prisma.story.count({ where: { sourceDatePublished: { gte: new Date('2026-01-01'), lt: new Date('2026-02-01') } } })
const feb = await prisma.story.count({ where: { sourceDatePublished: { gte: new Date('2026-02-01'), lt: new Date('2026-03-01') } } })
const mar = await prisma.story.count({ where: { sourceDatePublished: { gte: new Date('2026-03-01'), lt: new Date('2026-03-08') } } })

console.log('Total stories:', total)
console.log('Status=fetched:', fetched)
console.log('Jan 2026:', jan)
console.log('Feb 2026:', feb)
console.log('Mar 1-7 2026:', mar)

await prisma.$disconnect()
