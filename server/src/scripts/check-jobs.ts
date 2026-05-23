import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const jobs = await prisma.jobRun.findMany({
  where: { jobName: { in: ['preassess_stories', 'assess_stories', 'publish_stories', 'crawl_feeds'] } },
  select: { jobName: true, cronExpression: true, enabled: true, lastStartedAt: true, lastCompletedAt: true, lastError: true },
  orderBy: { lastStartedAt: 'desc' },
  take: 20,
})
jobs.forEach(j => console.log(
  j.jobName.padEnd(25),
  j.cronExpression.padEnd(15),
  j.enabled ? '✓' : '✗',
  j.lastStartedAt?.toISOString() ?? 'never'
))
await prisma.$disconnect()
