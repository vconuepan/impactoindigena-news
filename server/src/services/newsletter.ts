import { tmpdir } from 'os'
import { join } from 'path'
import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { type Prisma, ContentStatus, StoryStatus, NewsletterSendStatus } from '@prisma/client'
import { paginate } from '../lib/paginate.js'
import { generateCarouselZip, type CarouselStory } from './carousel.js'
import * as brevo from './brevo.js'
import { createLogger } from '../lib/logger.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { withRetry } from '../lib/retry.js'
import { buildNewsletterSelectPrompt, buildNewsletterIntroPrompt } from '../prompts/index.js'
import { newsletterSelectResultSchema, newsletterIntroSchema } from '../schemas/llm.js'

const log = createLogger('newsletter')

/** Issue slug → dot color hex for email HTML (mirrors client/src/lib/category-colors.ts) */
const ISSUE_DOT_COLORS: Record<string, string> = {
  'cambio-climatico': '#2dd4bf',
  'derechos-indigenas': '#f87171',
  'desarrollo-sostenible-y-autodeterminado': '#fbbf24',
  'reconciliacion-y-paz': '#818cf8',
}
const DEFAULT_DOT_COLOR = '#f472b6'

/** Fixed display order for top-level issues in the newsletter */
const ISSUE_ORDER = ['cambio-climatico', 'derechos-indigenas', 'desarrollo-sostenible-y-autodeterminado', 'reconciliacion-y-paz']

function getIssueDotColor(slug: string): string {
  return ISSUE_DOT_COLORS[slug] ?? DEFAULT_DOT_COLOR
}

function getIssueSortIndex(slug: string): number {
  const idx = ISSUE_ORDER.indexOf(slug)
  return idx >= 0 ? idx : ISSUE_ORDER.length
}

interface NewsletterFilters {
  status?: string
  page?: number
  pageSize?: number
}

export async function getNewsletters(filters: NewsletterFilters) {
  const page = filters.page || 1
  const pageSize = filters.pageSize || 25
  const where: Prisma.NewsletterWhereInput = {}
  if (filters.status) where.status = filters.status as ContentStatus

  return paginate({
    findMany: () =>
      prisma.newsletter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    count: () => prisma.newsletter.count({ where }),
    page,
    pageSize,
  })
}

export async function getNewsletterById(id: string) {
  return prisma.newsletter.findUnique({ where: { id } })
}

export async function createNewsletter(data: { title: string }) {
  return prisma.newsletter.create({ data: { title: data.title } })
}

export async function updateNewsletter(id: string, data: Prisma.NewsletterUpdateInput) {
  return prisma.newsletter.update({ where: { id }, data })
}

export async function deleteNewsletter(id: string) {
  await prisma.newsletter.delete({ where: { id } })
}

export async function assignStories(newsletterId: string) {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!newsletter) throw new Error('Newsletter not found')

  // Collect story IDs already used in newsletters published in the last 7 days
  // (covers both sends in a Mon+Thu schedule) to prevent repetition across editions.
  const recentlySent = await prisma.newsletter.findMany({
    where: {
      id: { not: newsletterId },
      status: ContentStatus.published,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { selectedStoryIds: true },
  })
  const usedStoryIds = new Set(recentlySent.flatMap(n => n.selectedStoryIds))

  // Find recently published stories from the last N days, excluding already-used ones
  const stories = await prisma.story.findMany({
    where: {
      status: StoryStatus.published,
      dateCrawled: { gte: new Date(Date.now() - config.content.storyAssignmentDays * 24 * 60 * 60 * 1000) },
      ...(usedStoryIds.size > 0 ? { id: { notIn: [...usedStoryIds] } } : {}),
    },
    orderBy: { dateCrawled: 'desc' },
    select: { id: true },
  })

  const storyIds = stories.map(s => s.id)
  if (storyIds.length === 0) throw new Error('No recent stories to assign')

  log.info({ newsletterId, usedStoryIds: usedStoryIds.size, available: storyIds.length }, 'stories assigned (excluding recent sends)')

  return prisma.newsletter.update({
    where: { id: newsletterId },
    data: { storyIds },
  })
}

export async function selectStoriesForNewsletter(newsletterId: string) {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!newsletter) throw new Error('Newsletter not found')
  if (newsletter.storyIds.length === 0) throw new Error('No stories in longlist')

  // Fetch stories with title, summary, and issue info
  const stories = await prisma.story.findMany({
    where: { id: { in: newsletter.storyIds } },
    select: {
      id: true,
      title: true,
      sourceTitle: true,
      summary: true,
      emotionTag: true,
      issue: { select: { id: true, name: true, parentId: true, parent: { select: { name: true } } } },
      feed: { select: { issue: { select: { name: true, parentId: true, parent: { select: { name: true } } } } } },
    },
  })

  // Resolve top-level issue name for each story
  const storiesForPrompt = stories.map(s => {
    const issue = s.issue ?? s.feed?.issue
    const issueName = issue?.parentId && issue.parent
      ? issue.parent.name
      : issue?.name ?? 'General'
    return {
      id: s.id,
      title: s.title || s.sourceTitle,
      summary: s.summary,
      issueName,
      emotionTag: s.emotionTag,
    }
  })

  // Get distinct top-level issue names
  const issueNames = [...new Set(storiesForPrompt.map(s => s.issueName))].sort()

  log.info(
    { newsletterId, storyCount: stories.length, issueCount: issueNames.length },
    'selecting stories for newsletter',
  )

  const prompt = buildNewsletterSelectPrompt(
    storiesForPrompt,
    config.newsletter.storiesPerIssue,
    issueNames,
  )

  await rateLimitDelay()
  const llm = getLLMByTier(config.newsletter.selectModelTier)
  const structuredLlm = llm.withStructuredOutput(newsletterSelectResultSchema, { method: 'functionCalling' })
  const response = await withRetry(
    () => structuredLlm.invoke([new HumanMessage(prompt)]),
    { retries: 3 },
  )

  // Only keep IDs that exist in the longlist
  const longlistSet = new Set(newsletter.storyIds)
  const selectedIds = response.selectedIds.filter(id => longlistSet.has(id))

  log.info(
    { newsletterId, selectedCount: selectedIds.length, requestedCount: config.newsletter.storiesPerIssue * issueNames.length },
    'newsletter story selection complete',
  )

  return prisma.newsletter.update({
    where: { id: newsletterId },
    data: { selectedStoryIds: selectedIds },
  })
}

export async function generateContent(newsletterId: string) {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!newsletter) throw new Error('Newsletter not found')
  if (newsletter.selectedStoryIds.length === 0) throw new Error('No stories selected')

  const stories = await prisma.story.findMany({
    where: { id: { in: newsletter.selectedStoryIds } },
    select: {
      id: true,
      title: true,
      sourceTitle: true,
      sourceUrl: true,
      slug: true,
      summary: true,
      relevanceSummary: true,
      marketingBlurb: true,
      quote: true,
      quoteAttribution: true,
      emotionTag: true,
      sourceDatePublished: true,
      dateCrawled: true,
      feed: { select: { id: true, title: true, displayTitle: true, issue: { select: { name: true, slug: true, parentId: true, parent: { select: { name: true, slug: true } } } } } },
      issue: { select: { name: true, slug: true, parentId: true, parent: { select: { name: true, slug: true } } } },
    },
    orderBy: { dateCrawled: 'desc' },
  })

  // Resolve each story's top-level (parent) issue
  function resolveIssue(story: typeof stories[number]) {
    const issue = story.issue ?? story.feed?.issue
    if (!issue) return { name: 'General', slug: 'general-news' }
    if (issue.parentId && issue.parent) {
      return { name: issue.parent.name, slug: issue.parent.slug }
    }
    return { name: issue.name, slug: issue.slug }
  }

  // Sort by fixed issue order, then by title within each group
  stories.sort((a, b) => {
    const slugA = resolveIssue(a).slug
    const slugB = resolveIssue(b).slug
    const orderDiff = getIssueSortIndex(slugA) - getIssueSortIndex(slugB)
    if (orderDiff !== 0) return orderDiff
    const titleA = a.title || a.sourceTitle || ''
    const titleB = b.title || b.sourceTitle || ''
    return titleA.localeCompare(titleB)
  })

  // Generate editorial intro via LLM
  const issueNames = [...new Set(stories.map(s => resolveIssue(s).name))]
    .sort((a, b) => {
      const slugA = stories.find(s => resolveIssue(s).name === a)!
      const slugB = stories.find(s => resolveIssue(s).name === b)!
      return getIssueSortIndex(resolveIssue(slugA).slug) - getIssueSortIndex(resolveIssue(slugB).slug)
    })
  const storiesForIntro = stories.map(s => ({
    title: s.title || s.sourceTitle,
    issueName: resolveIssue(s).name,
    blurb: s.marketingBlurb || s.summary || '',
    emotionTag: s.emotionTag || 'calm',
  }))

  let intro = ''
  try {
    const introPrompt = buildNewsletterIntroPrompt(storiesForIntro, issueNames)
    await rateLimitDelay()
    const llm = getLLMByTier(config.newsletter.contentModelTier)
    const structuredLlm = llm.withStructuredOutput(newsletterIntroSchema, { method: 'functionCalling' })
    const introResult = await withRetry(
      () => structuredLlm.invoke([new HumanMessage(introPrompt)]),
      { retries: 3 },
    )
    intro = introResult.intro
    log.info({ newsletterId, introLength: intro.length }, 'generated newsletter intro')
  } catch (err) {
    log.warn({ newsletterId, err }, 'failed to generate newsletter intro, continuing without it')
  }

  // Build markdown content with issue section headers
  let content = ''
  if (intro) {
    content += `${intro}\n\n---\n\n`
  }

  let currentIssue = ''
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i]
    const resolved = resolveIssue(story)
    const issueName = resolved.name
    const issueSlug = resolved.slug
    const publisher = story.feed?.displayTitle || story.feed?.title || 'Unknown'
    // ?_r=newsletter enables traffic attribution in the analytics dashboard
    const relevanceUrl = story.slug ? `https://impactoindigena.news/stories/${story.slug}?_r=newsletter` : ''

    // Add issue section header when the group changes
    if (issueName !== currentIssue) {
      if (currentIssue) content += `---\n\n` // separator between issue groups
      currentIssue = issueName
      content += `# ${issueName} {${issueSlug}}\n\n`
    }

    content += `## ${story.title || story.sourceTitle}\n`
    const feedId = story.feed?.id || ''
    const linkParts = [feedId ? `{feed:${feedId}} ${publisher}` : publisher]
    linkParts.push(`[artículo original](${story.sourceUrl})`)
    if (relevanceUrl) linkParts.push(`[análisis de relevancia](${relevanceUrl})`)
    content += `${linkParts.join(' · ')}\n\n`

    // Alternate between relevanceSummary (2/3) and quote (1/3)
    const useQuote = i % 3 === 2 && story.quote && story.quoteAttribution
    if (useQuote) {
      content += `> "${story.quote}"\n`
      content += `> — ${story.quoteAttribution}\n\n`
    } else {
      const summary = story.relevanceSummary || story.marketingBlurb || ''
      if (summary) content += `${summary}\n\n`
    }
  }

  return prisma.newsletter.update({
    where: { id: newsletterId },
    data: { content: content.trim() },
  })
}

export async function generateCarouselForNewsletter(newsletterId: string): Promise<string> {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!newsletter) throw new Error('Newsletter not found')
  if (newsletter.selectedStoryIds.length === 0) throw new Error('No stories selected')

  const stories = await prisma.story.findMany({
    where: { id: { in: newsletter.selectedStoryIds } },
    include: { feed: { include: { issue: true } }, issue: true },
    orderBy: { dateCrawled: 'desc' },
  })

  // Sort by issue name for grouping
  stories.sort((a, b) => {
    const nameA = a.issue?.name || a.feed?.issue?.name || ''
    const nameB = b.issue?.name || b.feed?.issue?.name || ''
    return nameA.localeCompare(nameB)
  })

  const carouselStories: CarouselStory[] = stories.map(s => ({
    title: s.title || s.sourceTitle,
    category: s.issue?.name || s.feed?.issue?.name || 'General',
    summary: s.summary || '',
    publisher: s.feed?.title || 'Unknown',
    date: s.sourceDatePublished?.toISOString() || null,
  }))

  const outputDir = join(tmpdir(), `carousel_${newsletterId}_${Date.now()}`)
  return generateCarouselZip(carouselStories, outputDir)
}

// --- HTML generation ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function generateHtmlContent(newsletterId: string): Promise<string> {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: newsletterId } })
  if (!newsletter) throw new Error('Newsletter not found')
  if (!newsletter.content) throw new Error('No content to convert')

  const sections = newsletter.content.split(/\n---\n/).filter(s => s.trim())

  let introHtml = ''
  const contentSections: string[] = []

  for (const section of sections) {
    const trimmed = section.trim()
    if (!introHtml && !trimmed.startsWith('#')) {
      introHtml = trimmed
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<p style="margin: 0 0 8px; font-size: 15px; color: #525252; line-height: 1.6;">${escapeHtml(l.trim())}</p>`)
        .join('\n              ')
    } else {
      contentSections.push(trimmed)
    }
  }

  const htmlBlocks: string[] = []

  for (const section of contentSections) {
    const lines = section.split('\n').filter(l => l.trim())

    let issueHeader = ''
    let issueSlug = ''
    const storyChunks: string[][] = []
    let currentChunk: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        const headerMatch = trimmed.slice(2).match(/^(.+?)\s*\{([^}]+)\}\s*$/)
        if (headerMatch) {
          issueHeader = headerMatch[1]
          issueSlug = headerMatch[2]
        } else {
          issueHeader = trimmed.slice(2)
        }
      } else if (trimmed.startsWith('## ') && currentChunk.length > 0) {
        storyChunks.push(currentChunk)
        currentChunk = [trimmed]
      } else {
        currentChunk.push(trimmed)
      }
    }
    if (currentChunk.length > 0) storyChunks.push(currentChunk)

    if (issueHeader) {
      const dotColor = getIssueDotColor(issueSlug)
      htmlBlocks.push(`
    <tr>
      <td style="padding: 32px 0 12px; text-align: center;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;"><tr>
          <td style="vertical-align: middle; padding-right: 12px;"><div style="width: 40px; border-top: 1px solid #e5e5e5;"></div></td>
          <td style="vertical-align: middle; padding-right: 8px; line-height: 0;"><div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${dotColor};"></div></td>
          <td style="vertical-align: middle; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #404040; white-space: nowrap;">${escapeHtml(issueHeader)}</td>
          <td style="vertical-align: middle; padding-left: 12px;"><div style="width: 40px; border-top: 1px solid #e5e5e5;"></div></td>
        </tr></table>
      </td>
    </tr>`)
    }

    for (const storyLines of storyChunks) {
      let title = ''
      let metaLine = ''
      const bodyParts: string[] = []

      for (const trimmed of storyLines) {
        if (trimmed.startsWith('## ')) {
          title = trimmed.slice(3)
        } else if (!title) {
          continue
        } else if (!metaLine && trimmed.match(/\[.*\]\(https?:\/\//)) {
          metaLine = trimmed
        } else if (trimmed.startsWith('> "') || trimmed.startsWith('> \u201C')) {
          const quoteText = trimmed.slice(2).replace(/^[""\u201C]|[""\u201D]$/g, '').trim()
          bodyParts.push(`<p style="margin: 0 0 4px; font-size: 15px; font-style: italic; color: #525252; line-height: 1.6;">\u201C${escapeHtml(quoteText)}\u201D</p>`)
        } else if (trimmed.startsWith('> \u2014') || trimmed.startsWith('> —')) {
          const attribution = trimmed.replace(/^> [—\u2014]\s*/, '').trim()
          bodyParts.push(`<p style="margin: 0 0 10px; font-size: 13px; color: #737373;">\u2014 ${escapeHtml(attribution)}</p>`)
        } else if (trimmed) {
          bodyParts.push(`<p style="margin: 0 0 10px; font-size: 15px; color: #525252; line-height: 1.6;">${escapeHtml(trimmed)}</p>`)
        }
      }

      if (title) {
        let originalUrl = ''
        let relevanceUrl = ''
        let publisherName = ''
        let feedId = ''
        if (metaLine) {
          const links = [...metaLine.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)]
          for (const link of links) {
            if (link[1] === 'artículo original') originalUrl = link[2]
            else if (link[1] === 'análisis de relevancia') relevanceUrl = link[2]
          }
          const feedMatch = metaLine.match(/\{feed:([^}]+)\}/)
          if (feedMatch) feedId = feedMatch[1]
          const firstBracket = metaLine.indexOf('[')
          if (firstBracket > 0) {
            publisherName = metaLine.slice(0, firstBracket).replace(/\{feed:[^}]+\}\s*/, '').replace(/·\s*$/, '').trim()
          }
        }

        const titleHtml = originalUrl
          ? `<a href="${escapeHtml(originalUrl)}" style="color: #171717; text-decoration: none;">${escapeHtml(title)}</a>`
          : escapeHtml(title)

        let metaHtml = ''
        if (publisherName || originalUrl) {
          const parts: string[] = []
          const faviconHtml = feedId
            ? `<img src="https://impactoindigena.news/images/feeds/${feedId}.png" alt="" width="14" height="14" style="display: inline-block; width: 14px; height: 14px; vertical-align: middle; border-radius: 2px; margin-right: 4px;">`
            : ''
          if (publisherName) parts.push(`${faviconHtml}<span style="vertical-align: middle;">${escapeHtml(publisherName)}</span>`)
          if (originalUrl) parts.push(`<a href="${escapeHtml(originalUrl)}" style="color: #2563eb; text-decoration: none; vertical-align: middle;">artículo original</a>`)
          if (relevanceUrl) parts.push(`<a href="${escapeHtml(relevanceUrl)}" style="color: #2563eb; text-decoration: none; vertical-align: middle;">análisis de relevancia</a>`)
          metaHtml = `<p style="margin: 0 0 12px; font-size: 13px; color: #737373; line-height: 20px;">${parts.join(' <span style="vertical-align: middle;">&middot;</span> ')}</p>`
        }

        htmlBlocks.push(`
    <tr>
      <td style="padding: 20px 0 4px;">
        <h2 style="margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #171717; line-height: 1.3;">${titleHtml}</h2>
        ${metaHtml}
        ${bodyParts.join('\n        ')}
      </td>
    </tr>`)
      }
    }
  }

  const introSection = introHtml
    ? `
          <!-- Intro -->
          <tr>
            <td style="padding: 12px 32px 8px;">
              ${introHtml}
            </td>
          </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(newsletter.title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 20px 32px 12px; text-align: center;">
              <a href="https://impactoindigena.news" style="text-decoration: none;">
                <img src="https://impactoindigena.news/images/logo-horizontal.png" alt="Impacto Indígena" width="200" style="display: inline-block; max-width: 200px; height: auto;" />
              </a>
              <p style="margin: -2px 0 0; font-size: 15px; font-style: italic; color: #a3a3a3;">Noticias de impacto indígena que están transformando el mundo</p>
            </td>
          </tr>
          <!-- Color strip -->
          <tr>
            <td style="padding: 16px 0 0; font-size: 0; line-height: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="width: 25%; height: 4px; background-color: #fbbf24;"></td>
                <td style="width: 25%; height: 4px; background-color: #2dd4bf;"></td>
                <td style="width: 25%; height: 4px; background-color: #f87171;"></td>
                <td style="width: 25%; height: 4px; background-color: #818cf8;"></td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 32px 12px; text-align: center;">
              <p style="margin: 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #404040;">${escapeHtml(newsletter.title)}</p>
            </td>
          </tr>
${introSection}
          <!-- Stories -->
          <tr>
            <td style="padding: 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${htmlBlocks.join('\n')}
              </table>
            </td>
          </tr>

          <!-- Support -->
          <tr>
            <td style="padding: 28px 32px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 14px; font-size: 14px; color: #525252;">Gratuito. Independiente. Sin publicidad. Ayúdanos a seguir así.</p>
              <a href="https://ko-fi.com/impactoindigena" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 24px; font-size: 14px; font-weight: 600; color: #ffffff; background-color: #171717; border-radius: 8px; text-decoration: none;">&#10084; Apóyanos</a>
            </td>
          </tr>

          <!-- AI disclosure -->
          <tr>
            <td style="padding: 28px 32px 16px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 16px; font-style: italic; color: #737373;">Curado y redactado con cuidado por IA</p>
              <p style="margin: 12px 0 0; font-size: 13px; color: #a3a3a3; line-height: 1.5;">Nuestra app puede tener errores. La IA puede equivocarse.<br>Si algo parece incorrecto, responde este correo y avísanos.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 24px; text-align: center; background-color: #fafafa; border-top: 1px solid #e5e5e5; margin-top: 16px;">
              <p style="margin: 0 0 10px; font-size: 12px; color: #a3a3a3;">
                <a href="https://impactoindigena.news" style="color: #2563eb; text-decoration: none;">impactoindigena.news</a>
              </p>
              <p style="margin: 0 0 10px; font-size: 12px; color: #a3a3a3;">
                <a href="https://bsky.app/profile/impactoindigena.bsky.social" style="color: #737373; text-decoration: none; vertical-align: middle;"><img src="https://impactoindigena.news/images/social/bluesky.png" alt="Bluesky" width="14" height="14" style="display: inline-block; width: 14px; height: 14px; vertical-align: middle; margin-right: 3px;">Bluesky</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #a3a3a3;">
                ¿Algo que mejorar? <a href="https://impactoindigena.news/feedback" style="color: #2563eb; text-decoration: none;">Envíanos tu feedback</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  await prisma.newsletter.update({
    where: { id: newsletterId },
    data: { html },
  })

  return html
}

// --- Newsletter sends ---

export async function getNewsletterSends(newsletterId: string) {
  return prisma.newsletterSend.findMany({
    where: { newsletterId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function sendTest(newsletterId: string) {
  const newsletter = await prisma.newsletter.findUniqueOrThrow({ where: { id: newsletterId } })
  if (!newsletter.html) throw new Error('No HTML content — generate HTML first')
  const html = newsletter.html

  log.info({ newsletterId }, 'creating test campaign in Brevo')
  const campaign = await brevo.createCampaign({
    name: `[TEST] ${newsletter.title}`,
    subject: `[TEST] ${newsletter.title}`,
    body: html,
    audienceType: config.brevo.testSegmentId ? 'SEGMENT' : 'ALL',
    segmentId: config.brevo.testSegmentId || undefined,
  })

  await brevo.sendCampaign(campaign.id)

  return prisma.newsletterSend.create({
    data: {
      newsletterId,
      plunkCampaignId: campaign.id,
      isTest: true,
      status: 'sent' as NewsletterSendStatus,
      htmlContent: html,
      sentAt: new Date(),
    },
  })
}

export async function sendLive(newsletterId: string, scheduledFor?: string) {
  const newsletter = await prisma.newsletter.findUniqueOrThrow({ where: { id: newsletterId } })
  if (!newsletter.html) throw new Error('No HTML content — generate HTML first')
  const html = newsletter.html

  log.info({ newsletterId, scheduledFor }, 'creating live campaign in Brevo')
  const campaign = await brevo.createCampaign({
    name: newsletter.title,
    subject: newsletter.title,
    body: html,
    audienceType: 'ALL',
  })

  await brevo.sendCampaign(campaign.id, scheduledFor)

  const status: NewsletterSendStatus = scheduledFor ? 'scheduled' : 'sending'

  return prisma.newsletterSend.create({
    data: {
      newsletterId,
      plunkCampaignId: campaign.id,
      isTest: false,
      status,
      htmlContent: html,
      sentAt: scheduledFor ? null : new Date(),
    },
  })
}

export async function refreshSendStats(sendId: string) {
  const send = await prisma.newsletterSend.findUniqueOrThrow({ where: { id: sendId } })
  if (!send.plunkCampaignId) throw new Error('No Brevo campaign ID')

  const stats = await brevo.getCampaignStats(send.plunkCampaignId)

  return prisma.newsletterSend.update({
    where: { id: sendId },
    data: { stats: stats as unknown as Prisma.JsonObject },
  })
}
