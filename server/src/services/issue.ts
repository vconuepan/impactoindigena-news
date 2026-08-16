import prisma from '../lib/prisma.js'
import type { Issue } from '@prisma/client'

// --- JSON field helpers ---

function serializeJsonFields(data: Record<string, any>): Record<string, any> {
  const result = { ...data }
  if ('evaluationCriteria' in result) {
    result.evaluationCriteria = JSON.stringify(result.evaluationCriteria ?? [])
  }
  if ('makeADifference' in result) {
    result.makeADifference = JSON.stringify(result.makeADifference ?? [])
  }
  return result
}

function parseJsonFields(issue: Issue) {
  return {
    ...issue,
    evaluationCriteria: safeParseJson(issue.evaluationCriteria, []),
    makeADifference: safeParseJson(issue.makeADifference, []),
  }
}

function deriveSourceNames(feeds: { title: string; displayTitle: string | null; active: boolean }[]): string[] {
  return [...new Set(
    feeds
      .filter(f => f.active)
      .map(f => f.displayTitle || f.title)
  )].sort()
}

export function safeParseJson<T>(value: string, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

// --- Admin queries ---

export async function getAllIssues() {
  const issues = await prisma.issue.findMany({
    orderBy: { name: 'asc' },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } },
      feeds: {
        select: {
          title: true,
          displayTitle: true,
          active: true,
          _count: { select: { stories: { where: { status: 'published' } } } }
        }
      }
    }
  })
  return issues.map(({ feeds, ...issue }) => ({
    ...parseJsonFields(issue as unknown as Issue),
    sourceNames: deriveSourceNames(feeds),
    parent: issue.parent,
    children: issue.children,
    publishedStoryCount: feeds.reduce((sum, f) => sum + f._count.stories, 0),
  }))
}

export async function getIssueById(id: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } },
      feeds: { select: { title: true, displayTitle: true, active: true } },
    },
  })
  if (!issue) return null
  const { feeds, ...rest } = issue
  return {
    ...parseJsonFields(rest as unknown as Issue),
    sourceNames: deriveSourceNames(feeds),
    parent: issue.parent,
    children: issue.children,
  }
}

export async function getIssueBySlug(slug: string): Promise<Issue | null> {
  return prisma.issue.findUnique({ where: { slug } })
}

export async function createIssue(data: {
  name: string
  slug: string
  description?: string
  promptFactors?: string
  promptAntifactors?: string
  promptRatings?: string
  parentId?: string | null
  intro?: string
  evaluationIntro?: string
  evaluationCriteria?: string[]
  makeADifference?: { label: string; url: string }[]
}) {
  if (data.parentId) {
    await validateParent(data.parentId)
  }
  const issue = await prisma.issue.create({ data: serializeJsonFields(data) as any })
  return parseJsonFields(issue)
}

export async function updateIssue(id: string, data: Partial<{
  name: string
  slug: string
  description: string
  promptFactors: string
  promptAntifactors: string
  promptRatings: string
  parentId: string | null
  intro: string
  evaluationIntro: string
  evaluationCriteria: string[]
  makeADifference: { label: string; url: string }[]
}>) {
  if ('parentId' in data && data.parentId !== undefined) {
    if (data.parentId !== null) {
      await validateParent(data.parentId, id)
    }
    // If this issue has children, it cannot become a child itself
    const childCount = await prisma.issue.count({ where: { parentId: id } })
    if (childCount > 0 && data.parentId !== null) {
      throw new Error('Cannot set parent on an issue that has children')
    }
  }
  const issue = await prisma.issue.update({ where: { id }, data: serializeJsonFields(data) })
  return parseJsonFields(issue)
}

async function validateParent(parentId: string, selfId?: string) {
  if (selfId && parentId === selfId) {
    throw new Error('An issue cannot be its own parent')
  }
  const parent = await prisma.issue.findUnique({ where: { id: parentId } })
  if (!parent) {
    throw new Error('Parent issue not found')
  }
  if (parent.parentId) {
    throw new Error('Cannot nest more than one level deep')
  }
}

// --- Public queries ---

const PUBLIC_ISSUE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  intro: true,
  evaluationIntro: true,
  evaluationCriteria: true,
  makeADifference: true,
  parentId: true,
} as const

function parsePublicIssueJson(issue: any) {
  return {
    ...issue,
    evaluationCriteria: safeParseJson(issue.evaluationCriteria, []),
    makeADifference: safeParseJson(issue.makeADifference, []),
  }
}

export async function getPublicIssues() {
  const feedSelect = { title: true, displayTitle: true, active: true } as const
  const issues = await prisma.issue.findMany({
    where: { parentId: null },
    select: {
      ...PUBLIC_ISSUE_SELECT,
      feeds: { select: feedSelect },
      children: {
        select: {
          ...PUBLIC_ISSUE_SELECT,
          feeds: { select: feedSelect },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })
  return issues.map(({ feeds, ...issue }) => ({
    ...parsePublicIssueJson(issue),
    sourceNames: deriveSourceNames([
      ...feeds,
      ...issue.children.flatMap(c => c.feeds),
    ]),
    children: issue.children.map(({ feeds: childFeeds, ...child }) => ({
      ...parsePublicIssueJson(child),
      sourceNames: deriveSourceNames(childFeeds),
    })),
  }))
}

export async function getPublicIssueBySlug(slug: string) {
  const issue = await prisma.issue.findFirst({
    where: { slug },
    select: {
      ...PUBLIC_ISSUE_SELECT,
      feeds: { select: { title: true, displayTitle: true, active: true } },
      children: {
        select: {
          ...PUBLIC_ISSUE_SELECT,
          feeds: {
            select: {
              title: true,
              displayTitle: true,
              active: true,
              _count: { select: { stories: { where: { status: 'published' } } } },
            },
          },
        },
        orderBy: { name: 'asc' },
      },
      parent: {
        select: { id: true, name: true, slug: true },
      },
    },
  })
  if (!issue) return null
  const { feeds, ...rest } = issue
  return {
    ...parsePublicIssueJson(rest),
    sourceNames: deriveSourceNames([
      ...feeds,
      ...(issue.children?.flatMap(c => c.feeds) ?? []),
    ]),
    children: issue.children?.map(({ feeds: childFeeds, ...child }) => ({
      ...parsePublicIssueJson(child),
      sourceNames: deriveSourceNames(childFeeds),
      publishedStoryCount: childFeeds.reduce((sum, f) => sum + f._count.stories, 0),
    })) ?? [],
    parent: issue.parent,
  }
}

// --- Delete ---

export async function deleteIssue(id: string): Promise<void> {
  const [feedCount, childCount] = await Promise.all([
    prisma.feed.count({ where: { issueId: id } }),
    prisma.issue.count({ where: { parentId: id } }),
  ])
  if (feedCount > 0) {
    throw new Error('Cannot delete issue with existing feeds')
  }
  if (childCount > 0) {
    throw new Error('Cannot delete issue with child issues')
  }
  await prisma.issue.delete({ where: { id } })
}
