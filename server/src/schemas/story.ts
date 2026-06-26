import { z } from 'zod'

const storyStatusEnum = z.enum([
  'fetched', 'pre_analyzed', 'analyzed', 'selected', 'published', 'rejected', 'trashed',
])

const emotionTagEnum = z.enum([
  'uplifting', 'frustrating', 'scary', 'calm',
])

const storySortEnum = z.enum([
  'rating_asc', 'rating_desc', 'date_asc', 'date_desc', 'title_asc', 'title_desc',
])

const ratingFilterEnum = z.enum([
  'gte4', 'gte5', 'gte6', 'gte7', 'lte3', 'lte4', 'lte5', 'lte6', 'lte7',
])

export const createStorySchema = z.object({
  sourceUrl: z.string().url('Must be a valid URL'),
  sourceTitle: z.string().min(1, 'Source title is required'),
  sourceContent: z.string().min(1, 'Source content is required'),
  feedId: z.string().uuid('Must be a valid feed ID'),
  sourceDatePublished: z.string().datetime().optional(),
})

export const updateStorySchema = z.object({
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().min(1).optional(),
  sourceContent: z.string().optional(),
  sourceDatePublished: z.string().datetime().nullable().optional(),
  title: z.string().min(1).nullable().optional(),
  titleLabel: z.string().min(1).nullable().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens').optional(),
  issueId: z.string().uuid().nullable().optional(),
  status: storyStatusEnum.optional(),
  relevancePre: z.number().int().min(0).max(10).nullable().optional(),
  relevance: z.number().int().min(0).max(10).nullable().optional(),
  emotionTag: emotionTagEnum.nullable().optional(),
  summary: z.string().nullable().optional(),
  quote: z.string().nullable().optional(),
  quoteAttribution: z.string().nullable().optional(),
  marketingBlurb: z.string().nullable().optional(),
  relevanceReasons: z.string().nullable().optional(),
  relevanceSummary: z.string().nullable().optional(),
  antifactors: z.string().nullable().optional(),
  relevanceCalculation: z.string().nullable().optional(),
})

export const updateStoryStatusSchema = z.object({
  status: storyStatusEnum,
})

export const bulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
  status: storyStatusEnum,
})

export const storyQuerySchema = z.object({
  status: z.union([storyStatusEnum, z.literal('all')]).optional(),
  issueId: z.string().uuid().optional(),
  feedId: z.string().uuid().optional(),
  crawledAfter: z.string().datetime().optional(),
  crawledBefore: z.string().datetime().optional(),
  ratingMin: z.coerce.number().int().min(0).max(10).optional(),
  ratingMax: z.coerce.number().int().min(0).max(10).optional(),
  rating: ratingFilterEnum.optional(),
  emotionTag: emotionTagEnum.optional(),
  publishYear: z.coerce.number().int().min(1900).max(2100).optional(),
  search: z.string().max(200).optional(),
  sort: storySortEnum.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
})

export const preassessBodySchema = z.object({
  storyIds: z.array(z.string().uuid()).optional(),
})

export const selectBodySchema = z.object({
  storyIds: z.array(z.string().uuid()).min(1, 'At least one story ID is required'),
})

export const batchStoriesQuerySchema = z.object({
  ids: z.string().min(1, 'At least one ID is required')
    .transform(str => str.split(',').map(s => s.trim()).filter(Boolean))
    .refine(
      arr => arr.length <= 100,
      { message: 'Maximum 100 IDs allowed' },
    )
    .refine(
      arr => arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      { message: 'All IDs must be valid UUIDs' },
    ),
})

export const bulkStoryIdsSchema = z.object({
  storyIds: z.array(z.string().uuid()).min(1, 'At least one story ID is required').max(500, 'Maximum 500 story IDs allowed'),
})

export const bulkSelectIdsSchema = z.object({
  storyIds: z.array(z.string().uuid()).min(2, 'At least 2 story IDs are required for selection').max(500, 'Maximum 500 story IDs allowed'),
})

export const publicStoryQuerySchema = z.object({
  issueSlug: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  emotionTags: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
})
