import { z } from 'zod'
import { isAllowedUrl } from '../utils/urlValidation.js'

// trim() runs before url()/refine so a URL with stray spaces is cleaned and
// validated (stray spaces in rss_url were breaking crawls — see
// content-extraction.md), then refine() rejects non-public hosts (SSRF).
const publicUrl = (msg = 'Must be a valid URL') =>
  z.string().trim().url(msg).refine(isAllowedUrl, 'URL must point to a public host')

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
  // trim() before min(1): a whitespace-only title is rejected instead of stored.
  title: z.string().trim().min(1, 'Title is required'),
  rssUrl: publicUrl(),
  url: publicUrl().nullable().optional(),
  displayTitle: z.string().trim().optional(),
  language: z.string().optional().default('en'),
  region: feedRegionSchema.nullable().optional(),
  issueId: z.string().min(1, 'Issue ID is required'),
  crawlIntervalHours: z.number().int().positive().optional().default(24),
  htmlSelector: z.string().optional(),
})

export const updateFeedSchema = z.object({
  title: z.string().trim().min(1).optional(),
  rssUrl: publicUrl().optional(),
  url: publicUrl().nullable().optional(),
  displayTitle: z.string().trim().nullable().optional(),
  language: z.string().optional(),
  region: feedRegionSchema.nullable().optional(),
  issueId: z.string().uuid('Must be a valid issue ID').optional(),
  crawlIntervalHours: z.number().int().positive().optional(),
  htmlSelector: z.string().nullable().optional(),
  active: z.boolean().optional(),
})
