import { z } from 'zod'

// --- LLM output schemas ---

export const mastodonPostTextSchema = z.object({
  postText: z.string().describe(
    'Short, informal editorial hook for Mastodon. Give readers a reason to care — ' +
    'why this matters, what it means, or a conversational intro that hooks attention. ' +
    'Do NOT summarize the story or repeat the title. ' +
    'Do NOT include any URLs or links (they are added automatically). ' +
    'End with 2-3 relevant hashtags for discovery. ' +
    'Write in a warm, conversational voice like a knowledgeable friend. Avoid clickbait.'
  ),
})

export type MastodonPostText = z.infer<typeof mastodonPostTextSchema>

// --- API request/response schemas ---

export const generateMastodonDraftBodySchema = z.object({
  storyId: z.string().uuid(),
})

export const pickAndDraftMastodonBodySchema = z.object({
  storyIds: z.array(z.string().uuid()).min(2).max(50),
})

export const updateMastodonDraftBodySchema = z.object({
  postText: z.string().min(1).max(500),
})

export const listMastodonPostsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const mastodonFeedQuerySchema = z.object({
  maxId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
})
