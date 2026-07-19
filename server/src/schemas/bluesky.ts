import { z } from 'zod'

// --- LLM output schemas ---

export const blueskyPostTextSchema = z.object({
  postText: z.string().describe(
    'Short, informal editorial hook for Bluesky. Give readers a reason to care — ' +
    'why this matters, what it means, or a conversational intro that hooks attention. ' +
    'Do NOT summarize the story or repeat the title. ' +
    'Do NOT include any URLs or links (the link is added as a card). ' +
    'End with 2-3 relevant hashtags for discovery. ' +
    'Write in a warm, conversational voice like a knowledgeable friend. Avoid clickbait.'
  ),
})

export type BlueskyPostText = z.infer<typeof blueskyPostTextSchema>

export const blueskyPickBestSchema = z.object({
  storyId: z.string().describe('The ID of the story best suited for a Bluesky post'),
  reasoning: z.string().describe(
    'Brief explanation of why this story was chosen (1-2 sentences). ' +
    'Consider timeliness, emotional appeal, broad relevance, and engagement potential.'
  ),
})

export type BlueskyPickBest = z.infer<typeof blueskyPickBestSchema>

// --- API request/response schemas ---

export const generateDraftBodySchema = z.object({
  storyId: z.string().uuid(),
})

export const pickAndDraftBodySchema = z.object({
  storyIds: z.array(z.string().uuid()).min(2).max(50),
})

export const updateDraftBodySchema = z.object({
  postText: z.string().min(1).max(300),
})

export const listPostsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
})
