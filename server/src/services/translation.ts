import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import { createLogger } from '../lib/logger.js'
import { getSmallLLM, rateLimitDelay } from './llm.js'
import prisma from '../lib/prisma.js'
import { truncateQuote } from '../lib/truncateQuote.js'

const log = createLogger('translation')

const translationSchema = z.object({
  titleLabel: z.string(),
  title: z.string(),
  summary: z.string(),
  quote: z.string(),
  marketingBlurb: z.string(),
  relevanceSummary: z.string(),
})

function buildTranslationPrompt(story: {
  titleLabel: string | null
  title: string | null
  summary: string | null
  quote: string | null
  marketingBlurb: string | null
  relevanceSummary: string | null
}): string {
  return `Translate the following news story fields from Spanish to English. Preserve the tone, style, and meaning exactly. Keep proper nouns (people names, place names, organization names) unchanged. Return structured JSON.

Fields to translate:
- titleLabel: "${story.titleLabel || ''}"
- title: "${story.title || ''}"
- summary: "${story.summary || ''}"
- quote: "${story.quote || ''}"
- marketingBlurb: "${story.marketingBlurb || ''}"
- relevanceSummary: "${story.relevanceSummary || ''}"`
}

export async function translateStory(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      titleLabel: true,
      title: true,
      summary: true,
      quote: true,
      marketingBlurb: true,
      relevanceSummary: true,
    },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title && !story.summary) {
    log.warn({ storyId }, 'story has no content to translate, skipping')
    return
  }

  const prompt = buildTranslationPrompt(story)
  const llm = getSmallLLM()
  const structuredLlm = llm.withStructuredOutput(translationSchema, { method: 'functionCalling' })

  await rateLimitDelay()
  log.info({ storyId }, 'translating story to English')

  const result = await structuredLlm.invoke([new HumanMessage(prompt)])

  await prisma.story.update({
    where: { id: storyId },
    data: {
      titleEn: result.title || null,
      titleLabelEn: result.titleLabel || null,
      summaryEn: result.summary || null,
      quoteEn: truncateQuote(result.quote),
      marketingBlurbEn: result.marketingBlurb || null,
      relevanceSummaryEn: result.relevanceSummary || null,
    },
  })

  log.info({ storyId }, 'translation complete')
}

export async function translateStoriesBatch(storyIds: string[]): Promise<{ translated: number; failed: number }> {
  let translated = 0
  let failed = 0

  for (const storyId of storyIds) {
    try {
      await translateStory(storyId)
      translated++
    } catch (err) {
      log.error({ err, storyId }, 'failed to translate story')
      failed++
    }
  }

  return { translated, failed }
}
