import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const [oldest, newest, storyCount] = await Promise.all([
    prisma.story.findFirst({ orderBy: { dateCrawled: 'asc' }, select: { dateCrawled: true } }),
    prisma.story.findFirst({ orderBy: { dateCrawled: 'desc' }, select: { dateCrawled: true } }),
    prisma.story.count({ where: { status: 'published' } }),
  ])
  const newsletters = await prisma.newsletter.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, createdAt: true, content: true, html: true, status: true }
  })
  console.log('Oldest story:', oldest?.dateCrawled?.toISOString().slice(0,10))
  console.log('Newest story:', newest?.dateCrawled?.toISOString().slice(0,10))
  console.log('Published stories:', storyCount)
  console.log('Total newsletters:', newsletters.length)
  console.log('')
  newsletters.forEach((n, i) => {
    const hasContent = (n.content?.length ?? 0) > 10
    const hasHtml = (n.html?.length ?? 0) > 10
    console.log(`${i+1}. [${n.status}] ${n.title} | ${n.createdAt.toISOString().slice(0,10)} | content:${hasContent?'✓':'✗'} html:${hasHtml?'✓':'✗'}`)
  })
  await prisma.$disconnect()
}
main().catch(console.error)
