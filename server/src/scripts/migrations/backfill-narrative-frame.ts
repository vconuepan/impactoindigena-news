/**
 * Backfill narrativeFrame for published stories that have no narrative frame.
 *
 * Only updates narrative_frame — does NOT touch emotionTag or any other field.
 *
 * Usage:
 *   npm run migration:backfill-narrative-frame --prefix server              # batch mode (updates DB)
 *   npm run migration:backfill-narrative-frame:test --prefix server         # test mode (first batch, no writes)
 *   npm run migration:backfill-narrative-frame --prefix server -- --override  # re-processes all published
 */

import { PrismaClient, NarrativeFrame } from '@prisma/client'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { Semaphore } from '../../lib/semaphore.js'
import { config } from '../../config.js'
import { getSmallLLM } from '../../services/llm.js'
import { NARRATIVE_FRAME_PROMPT_BLOCK, formatArticlesBlock } from '../../prompts/shared.js'

const TEST_MODE = process.argv.includes('--test')
const OVERRIDE_MODE = process.argv.includes('--override')
const CONCURRENCY = 5
const BATCH_SIZE = config.preassess.batchSize

const prisma = new PrismaClient()

const narrativeFrameSchema = z.enum(['confrontacion', 'resiliencia', 'protagonismo', 'alianza'])

const resultSchema = z.object({
  articles: z.array(
    z.object({
      articleId: z.string(),
      issueSlug: z.string(),
      narrativeFrame: narrativeFrameSchema,
    }),
  ),
})

const structuredLlm = getSmallLLM().withStructuredOutput(resultSchema, { method: 'functionCalling' })
const semaphore = new Semaphore(CONCURRENCY)

function buildPrompt(
  stories: { id: string; sourceTitle: string; sourceContent: string }[],
  fallbackSlug: string,
): string {
  const mapped = stories.map((s) => ({ id: s.id, title: s.sourceTitle, content: s.sourceContent }))

  return `<ROLE>
You are a narrative frame classifier analyzing news articles about indigenous peoples.
</ROLE>

<GOAL>
For each article: assign a narrative frame.
Use issue slug "${fallbackSlug}" for all articles (issue classification is not needed).
Do not rate the articles. Do not assign an emotion tag.
</GOAL>

${NARRATIVE_FRAME_PROMPT_BLOCK}

${formatArticlesBlock(mapped)}`
}

async function main() {
  const mode = TEST_MODE ? 'TEST (no DB writes)' : OVERRIDE_MODE ? 'OVERRIDE' : 'BATCH'
  console.log(`Mode: ${mode}`)
  console.log(`Concurrency: ${CONCURRENCY}, Batch size: ${BATCH_SIZE}`)
  console.log(`Provider: ${config.llm.provider}`)

  const firstIssue = await prisma.issue.findFirst({ select: { slug: true } })
  const fallbackSlug = firstIssue?.slug ?? 'unknown'

  const total = await prisma.story.count({
    where: {
      status: 'published',
      ...(!OVERRIDE_MODE && { narrativeFrame: null }),
    },
  })
  console.log(`\nStories to classify: ${total}`)

  let cursor: string | undefined
  let processed = 0
  let failed = 0
  let skipped = 0

  while (true) {
    const stories = await prisma.story.findMany({
      where: {
        status: 'published',
        ...(!OVERRIDE_MODE && { narrativeFrame: null }),
      },
      select: {
        id: true,
        sourceTitle: true,
        sourceContent: true,
      },
      take: TEST_MODE ? BATCH_SIZE : BATCH_SIZE * CONCURRENCY,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })

    if (stories.length === 0) break

    const batches: (typeof stories)[] = []
    for (let i = 0; i < stories.length; i += BATCH_SIZE) {
      batches.push(stories.slice(i, i + BATCH_SIZE))
    }

    const results = await Promise.allSettled(
      batches.map((batch) =>
        semaphore.run(async () => {
          const prompt = buildPrompt(batch, fallbackSlug)
          const response = await structuredLlm.invoke([new HumanMessage(prompt)])

          const storyMap = new Map(batch.map((s) => [s.id, s]))

          for (const item of response.articles) {
            const story = storyMap.get(item.articleId)
            if (!story) {
              console.warn(`  LLM returned unknown articleId: ${item.articleId}`)
              skipped++
              continue
            }

            const parsed = narrativeFrameSchema.safeParse(item.narrativeFrame)
            if (!parsed.success) {
              console.warn(`  Invalid narrativeFrame "${item.narrativeFrame}" for ${story.sourceTitle.slice(0, 50)}`)
              skipped++
              continue
            }

            console.log(`  [${parsed.data.padEnd(14)}] ${story.sourceTitle.slice(0, 70)}`)

            if (!TEST_MODE) {
              await prisma.story.update({
                where: { id: story.id },
                data: { narrativeFrame: parsed.data as NarrativeFrame },
              })
            }

            processed++
          }

          const returnedIds = new Set(response.articles.map((a) => a.articleId))
          for (const story of batch) {
            if (!returnedIds.has(story.id)) {
              console.warn(`  LLM did not return result for: ${story.sourceTitle.slice(0, 50)}`)
              skipped++
            }
          }
        }),
      ),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        failed++
        console.error('Batch failed:', result.reason)
      }
    }

    cursor = stories[stories.length - 1].id

    if (TEST_MODE) break
  }

  console.log(`\nDone. Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
