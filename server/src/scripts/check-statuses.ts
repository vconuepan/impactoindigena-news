import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const statuses = await prisma.story.groupBy({
  by: ['status'],
  _count: true,
  orderBy: { _count: { status: 'desc' } },
})
statuses.forEach(s => console.log(String(s._count).padStart(6), s.status))
await prisma.$disconnect()
