import crypto from 'node:crypto'
import OpenAI, { AzureOpenAI } from 'openai'
import { withRetry } from '../lib/retry.js'
import { createLogger } from '../lib/logger.js'
import { config } from '../config.js'
import {
  fetchStoryForEmbedding,
  fetchStoriesForEmbedding,
  saveEmbedding,
  type StoryEmbeddingRow,
} from '../lib/vectors.js'

const log = createLogger('embedding')

let _openai: OpenAI | null = null

// Lazy init: construir el cliente en el primer uso, no al importar el módulo.
// Instanciarlo eager rompía la carga de cualquier test que importe esta cadena
// cuando OPENAI_API_KEY no está seteada (p. ej. en CI).
function getOpenAI(): OpenAI {
  if (_openai) return _openai
  _openai = config.llm.provider === 'azure'
    ? new AzureOpenAI({
        endpoint: config.llm.azure.endpoint,
        apiKey: config.llm.azure.apiKey,
        apiVersion: config.llm.azure.apiVersion,
        deployment: config.llm.azure.deployments.embedding,
      })
    : new OpenAI()
  return _openai
}

export type StoryForEmbedding = StoryEmbeddingRow

export function buildEmbeddingContent(story: Pick<StoryForEmbedding, 'title' | 'titleLabel' | 'summary'>): string {
  const parts: string[] = []

  if (story.titleLabel && story.title) {
    parts.push(`${story.titleLabel}: ${story.title}`)
  } else if (story.title) {
    parts.push(story.title)
  }

  if (story.summary) {
    parts.push(story.summary)
  }

  return parts.join('\n')
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function needsEmbeddingUpdate(
  story: Pick<StoryForEmbedding, 'embeddingContentHash'>,
  currentHash: string,
): boolean {
  return story.embeddingContentHash !== currentHash
}

// ~8k token limit for text-embedding-3-small; truncate at char level with safety margin
const MAX_EMBEDDING_CHARS = 30_000

// Small LRU cache for search query embeddings to avoid redundant OpenAI calls.
// 50 entries * ~6KB each = ~300KB max memory.
const SEARCH_CACHE_MAX = 50
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const searchEmbeddingCache = new Map<string, { embedding: number[]; expiry: number }>()

function evictExpiredSearchCache() {
  const now = Date.now()
  for (const [key, entry] of searchEmbeddingCache) {
    if (entry.expiry <= now) searchEmbeddingCache.delete(key)
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.length > MAX_EMBEDDING_CHARS ? text.slice(0, MAX_EMBEDDING_CHARS) : text
  const response = await withRetry(
    () =>
      getOpenAI().embeddings.create({
        model: config.embedding.model,
        input,
        dimensions: config.embedding.dimensions,
      }),
    { retries: 3, baseDelayMs: 1000 },
  )
  return response.data[0].embedding
}

/**
 * Generate embedding for a search query with caching.
 * Identical queries within the TTL reuse the cached embedding.
 */
export async function generateSearchEmbedding(query: string): Promise<number[]> {
  const key = query.trim().toLowerCase()

  const cached = searchEmbeddingCache.get(key)
  if (cached && cached.expiry > Date.now()) return cached.embedding

  const embedding = await generateEmbedding(query)

  // Evict expired entries and enforce max size
  evictExpiredSearchCache()
  if (searchEmbeddingCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchEmbeddingCache.keys().next().value!
    searchEmbeddingCache.delete(oldest)
  }

  searchEmbeddingCache.set(key, { embedding, expiry: Date.now() + SEARCH_CACHE_TTL_MS })
  return embedding
}

export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<number[][]> {
  const response = await withRetry(
    () =>
      getOpenAI().embeddings.create({
        model: config.embedding.model,
        input: texts,
        dimensions: config.embedding.dimensions,
      }),
    { retries: 3, baseDelayMs: 1000 },
  )
  // OpenAI returns embeddings in order of input, but sort by index to be safe
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

/**
 * Generate an embedding vector for story content without touching the DB.
 * Returns the vector + hash, or null if no update is needed.
 * Throws on OpenAI failure (after 3 retries via withRetry).
 */
export async function generateEmbeddingForContent(
  story: Pick<StoryForEmbedding, 'title' | 'titleLabel' | 'summary' | 'embeddingContentHash'>,
): Promise<{ embedding: number[]; hash: string } | null> {
  const content = buildEmbeddingContent(story)
  if (!content) return null

  const hash = computeContentHash(content)
  if (!needsEmbeddingUpdate(story, hash)) return null

  const embedding = await generateEmbedding(content)
  return { embedding, hash }
}

export interface EmbeddingResult {
  id: string
  success: boolean
  embedding?: number[]
  hash?: string
  error?: string
}

/**
 * Generate embeddings for multiple stories in batch.
 * Returns per-story results (success/failure) so callers can decide
 * which stories to proceed with.
 */
export async function batchGenerateEmbeddings(
  storyIds: string[],
  statusFilter?: 'published' | 'selected' | 'analyzed',
): Promise<EmbeddingResult[]> {
  if (storyIds.length === 0) return []

  const stories = await fetchStoriesForEmbedding(storyIds, statusFilter)

  // Identify which stories need embedding updates
  const results: EmbeddingResult[] = []
  const toProcess: { story: StoryForEmbedding; content: string; hash: string }[] = []

  for (const story of stories) {
    const content = buildEmbeddingContent(story)
    if (!content) {
      results.push({ id: story.id, success: true }) // nothing to embed, skip
      continue
    }
    const hash = computeContentHash(content)
    if (!needsEmbeddingUpdate(story, hash)) {
      results.push({ id: story.id, success: true }) // already up to date
      continue
    }
    toProcess.push({ story, content, hash })
  }

  // Stories in storyIds but not returned by fetchStoriesForEmbedding (wrong status, not found)
  const foundIds = new Set(stories.map(s => s.id))
  for (const id of storyIds) {
    if (!foundIds.has(id)) {
      results.push({ id, success: false, error: 'Story not found or wrong status' })
    }
  }

  // Process in batches for API efficiency
  const batchSize = config.embedding.batchSize
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize)
    try {
      const embeddings = await generateEmbeddingsBatch(batch.map(b => b.content))
      for (let j = 0; j < batch.length; j++) {
        results.push({
          id: batch[j].story.id,
          success: true,
          embedding: embeddings[j],
          hash: batch[j].hash,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Embedding generation failed'
      log.error({ err, batchStart: i, batchSize: batch.length }, 'failed to generate embeddings batch')
      for (const item of batch) {
        results.push({ id: item.story.id, success: false, error: msg })
      }
    }

    // Rate limit delay between batches
    if (i + batchSize < toProcess.length) {
      await new Promise(resolve => setTimeout(resolve, config.embedding.delayMs))
    }
  }

  return results
}

/**
 * Ensure a story has an embedding. If one already exists (and content hasn't
 * changed), this is a no-op. If missing, generates and persists one.
 * Used as a safety net when publishing stories that may not have been assessed.
 */
export async function ensureEmbedding(storyId: string): Promise<void> {
  try {
    const story = await fetchStoryForEmbedding(storyId)
    if (!story) return

    const embeddingData = await generateEmbeddingForContent(story)
    if (embeddingData) {
      await saveEmbedding(storyId, embeddingData.embedding, embeddingData.hash)
    }
  } catch (err) {
    log.warn({ err, storyId }, 'failed to ensure embedding, proceeding without')
  }
}

/**
 * Batch version: ensures embeddings exist for multiple stories.
 * Skips stories that already have up-to-date embeddings (content hash match).
 */
export async function ensureEmbeddings(storyIds: string[]): Promise<void> {
  if (storyIds.length === 0) return

  const results = await batchGenerateEmbeddings(storyIds)

  for (const result of results) {
    if (result.success && result.embedding && result.hash) {
      await saveEmbedding(result.id, result.embedding, result.hash)
    }
  }

  const failed = results.filter(r => !r.success)
  if (failed.length > 0) {
    log.warn({ failedCount: failed.length }, 'some embeddings failed during ensure')
  }
}
