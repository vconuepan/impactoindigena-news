import { z } from 'zod'

export const generateTwitterDraftBodySchema = z.object({
  storyId: z.string().uuid(),
})

export const updateTwitterDraftBodySchema = z.object({
  postText: z.string().min(1),
})

export const listTwitterPostsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
