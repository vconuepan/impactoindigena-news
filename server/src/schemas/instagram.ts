import { z } from 'zod'

export const generateInstagramDraftBodySchema = z.object({
  storyId: z.string().uuid(),
})

export const updateInstagramDraftBodySchema = z.object({
  caption: z.string().min(1),
})

export const listInstagramPostsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'failed', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
