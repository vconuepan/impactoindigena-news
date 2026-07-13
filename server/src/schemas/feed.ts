import { z } from 'zod'

const feedRegionValues = [
  'north_america',
  'western_europe',
  'eastern_europe',
  'middle_east_north_africa',
  'sub_saharan_africa',
  'south_southeast_asia',
  'pacific',
  'latin_america',
  'global',
] as const

const feedRegionSchema = z.enum(feedRegionValues)

export const createFeedSchema = z.object({
  // trim() runs before the checks: a whitespace-only title fails min(1), and a
  // URL with stray spaces passes url() instead of being silently stored dirty
  // (stray spaces in rss_url were breaking crawls — see content-extraction.md).
  title: z.string().trim().min(1, 'Title is required'),
  rssUrl: z.string().trim().url('Must be a valid URL'),
  url: z.string().trim().url('Must be a valid URL').nullable().optional(),
  displayTitle: z.string().trim().optional(),
  language: z.string().optional().default('en'),
  region: feedRegionSchema.nullable().optional(),
  issueId: z.string().min(1, 'Issue ID is required'),
  crawlIntervalHours: z.number().int().positive().optional().default(24),
  htmlSelector: z.string().optional(),
})

export const updateFeedSchema = z.object({
  title: z.string().trim().min(1).optional(),
  rssUrl: z.string().trim().url('Must be a valid URL').optional(),
  url: z.string().trim().url('Must be a valid URL').nullable().optional(),
  displayTitle: z.string().trim().nullable().optional(),
  language: z.string().optional(),
  region: feedRegionSchema.nullable().optional(),
  issueId: z.string().uuid('Must be a valid issue ID').optional(),
  crawlIntervalHours: z.number().int().positive().optional(),
  htmlSelector: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
