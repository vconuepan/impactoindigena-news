/**
 * Typed wrapper for pgvector raw SQL operations.
 *
 * Prisma's `Unsupported("vector(1536)")` doesn't generate typed fields,
 * so all embedding operations require `$queryRaw` / `$executeRaw`.
 * This module centralizes those queries with proper types and helpers.
 */

import { Prisma } from '@prisma/client'
import prisma from './prisma.js'
import { config } from '../config.js'

// ──── Types ────────────────────────────────────────────────────────────────

export interface StoryEmbeddingRow {
  id: string
  title: string | null
  titleLabel: string | null
  summary: string | null
  embeddingContentHash: string | null
}

/** Raw SQL returns snake_case — mapped to camelCase by the functions below. */
interface RawStoryRow {
  id: string
  title: string | null
  title_label: string | null
  summary: string | null
  embedding_content_hash: string | null
}

function mapRow(row: RawStoryRow): StoryEmbeddingRow {
  return {
    id: row.id,
    title: row.title,
    titleLabel: row.title_label,
    summary: row.summary,
    embeddingContentHash: row.embedding_content_hash,
  }
}

// ──── Vector Helpers ───────────────────────────────────────────────────────

/** Convert a number array to a pgvector literal string, e.g. "[0.1,0.2,...]" */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// ──── Queries ──────────────────────────────────────────────────────────────

/** Fetch a single story's embedding-relevant fields (any status). */
export async function fetchStoryForEmbedding(
  storyId: string,
): Promise<(StoryEmbeddingRow & { status: string }) | null> {
  const rows = await prisma.$queryRaw<(RawStoryRow & { status: string })[]>`
    SELECT id, status, title, title_label, summary, embedding_content_hash
    FROM stories
    WHERE id = ${storyId}
  `
  if (rows.length === 0) return null
  return { ...mapRow(rows[0]), status: rows[0].status }
}

/** Fetch multiple stories' embedding-relevant fields. Optionally filter by status. */
export async function fetchStoriesForEmbedding(
  storyIds: string[],
  statusFilter?: 'published' | 'selected' | 'analyzed',
): Promise<StoryEmbeddingRow[]> {
  if (storyIds.length === 0) return []
  const statusClause = statusFilter
    ? Prisma.sql`AND status = ${statusFilter}::"StoryStatus"`
    : Prisma.empty
  const rows = await prisma.$queryRaw<RawStoryRow[]>`
    SELECT id, title, title_label, summary, embedding_content_hash
    FROM stories
    WHERE id IN (${Prisma.join(storyIds)}) ${statusClause}
  `
  return rows.map(mapRow)
}

/** Save an embedding vector + content hash to a story row. */
export async function saveEmbedding(
  storyId: string,
  embedding: number[],
  contentHash: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE stories
    SET embedding = ${JSON.stringify(embedding)}::vector,
        embedding_content_hash = ${contentHash},
        embedding_generated_at = NOW()
    WHERE id = ${storyId}
  `
}

/** Save an embedding vector + content hash inside an interactive transaction. */
export async function saveEmbeddingTx(
  tx: { $executeRaw: typeof prisma.$executeRaw },
  storyId: string,
  embedding: number[],
  contentHash: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE stories
    SET embedding = ${JSON.stringify(embedding)}::vector,
        embedding_content_hash = ${contentHash},
        embedding_generated_at = NOW()
    WHERE id = ${storyId}
  `
}

/**
 * Search published stories by embedding cosine distance.
 *
 * DESCARTA LO QUE NO SE PARECE A NADA, que hasta el 11-sep-2026 no hacia: esta
 * consulta ordenaba por distancia y cortaba en `limit` **sin filtrar**, asi que
 * siempre devolvia las N mas cercanas por lejanas que fueran. Medido en vivo
 * contra la busqueda publica: `qwertzxcvnoexiste` devolvia **50 resultados** y
 * `asdfghjklñpoiu` otros 50, contra 96 de «mapuche» y 61 de «consulta». No habia
 * separacion util entre una busqueda real y un teclazo, y el lector recibia
 * decenas de articulos sin relacion presentados como resultados.
 *
 * La pagina de busqueda YA sabia decir «No se encontraron resultados» — la clave
 * `search.noResults` existe y esta traducida—, pero ese estado era inalcanzable
 * porque el backend nunca devolvia cero.
 *
 * SOBRE EL UMBRAL: `<=>` es distancia coseno (1 - coseno). El primer valor,
 * 1.0, era la ortogonalidad y no descartaba nada: con text-embedding-3-small dos
 * textos sin relacion quedan entre 0,7 y 0,9. **Calibrado el 2-nov-2026 en 0.76**
 * sin tocar la base: se replicaron los embeddings de las 4.893 noticias desde la
 * API publica y se calificaron a ciegas 329 pares de la franja dudosa. Por encima
 * de 0,76 la pertinencia media es 0,043. Metodo y datos: `scripts/calibrar-busqueda.ts`,
 * `lib/calibracion/busqueda-2026-11-02.json` y `.context/embeddings.md`. Se cambia
 * con `SEARCH_MAX_COSINE_DISTANCE`, sin tocar codigo.
 */
export async function searchByEmbedding(
  queryEmbedding: number[],
  options?: {
    limit?: number
    issueFilter?: Prisma.Sql
    dateFilter?: Prisma.Sql
    /** Distancia coseno maxima aceptada. Por defecto, `config.search.maxCosineDistance`. */
    maxDistance?: number
  },
): Promise<{ id: string }[]> {
  const limit = options?.limit ?? 50
  const issueFilter = options?.issueFilter ?? Prisma.empty
  const dateFilter = options?.dateFilter ?? Prisma.empty
  const maxDistance = options?.maxDistance ?? config.search.maxCosineDistance
  const vectorStr = toVectorLiteral(queryEmbedding)

  return prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id
    FROM stories s
    WHERE s.status = 'published'
      AND s.embedding IS NOT NULL
      AND (s.embedding <=> ${vectorStr}::vector) < ${maxDistance}
      ${issueFilter}
      ${dateFilter}
    ORDER BY s.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `
}

/** Cursor-based fetch for backfill scripts. Uses its own PrismaClient if provided. */
export async function fetchEmbeddingBackfillBatch(
  cursor: string | undefined,
  limit: number,
  overrideMode: boolean,
  client: { $queryRaw: typeof prisma.$queryRaw } = prisma,
): Promise<StoryEmbeddingRow[]> {
  const hashFilter = overrideMode
    ? Prisma.empty
    : Prisma.sql`AND embedding_content_hash IS NULL`
  const cursorFilter = cursor
    ? Prisma.sql`AND id > ${cursor}`
    : Prisma.empty

  const rows = await client.$queryRaw<RawStoryRow[]>`
    SELECT id, title, title_label, summary, embedding_content_hash
    FROM stories
    WHERE status = 'published'
    ${hashFilter}
    ${cursorFilter}
    ORDER BY id ASC
    LIMIT ${limit}
  `
  return rows.map(mapRow)
}

/** Save an embedding using a custom PrismaClient (for scripts with their own client). */
export async function saveEmbeddingWithClient(
  client: { $executeRaw: typeof prisma.$executeRaw },
  storyId: string,
  embedding: number[],
  contentHash: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE stories
    SET embedding = ${JSON.stringify(embedding)}::vector,
        embedding_content_hash = ${contentHash},
        embedding_generated_at = NOW()
    WHERE id = ${storyId}
  `
}
