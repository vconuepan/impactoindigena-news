# Semantic Search & Embeddings

> **Spec:** [`.specs/search.allium`](../.specs/search.allium) -- hybrid RRF search, related stories with LRU cache, emotion filtering. This file covers embedding generation, database schema, backfill scripts, and configuration.

## Umbral de relevancia (`SEARCH_MAX_COSINE_DISTANCE`)

La busqueda semantica **descarta lo que supera una distancia coseno maxima**,
`config.search.maxCosineDistance` (1.0 por defecto).

**Por que existe.** Hasta el 11-sep-2026 `searchByEmbedding` ordenaba por
distancia y cortaba en 50 sin filtrar, asi que devolvia siempre las 50 mas
cercanas por lejanas que fueran. Medido en produccion: `qwertzxcvnoexiste` →
**50 resultados**, `asdfghjklñpoiu` → 50, contra 96 de «mapuche» y 61 de
«consulta». Ademas dejaba inalcanzable el estado vacio de `/search`, que existe
y esta traducido (`search.noResults`).

**De donde sale el 1.0.** `<=>` sobre embeddings normalizados da [0,2], y 1.0 es
la **ortogonalidad**: dos textos sin relacion lineal. Sale de la geometria, no de
una calibracion sobre este corpus, y es deliberadamente conservador — antes dejar
pasar algo dudoso que esconder un resultado bueno.

**Sigue sin calibrar con datos reales**, porque medir distancias exige la base y
esta tras el firewall. Para ajustarlo, con el firewall abierto:

```sql
SELECT s.title, s.embedding <=> '[...]'::vector AS distancia
FROM stories s
WHERE s.status = 'published' AND s.embedding IS NOT NULL
ORDER BY 2 LIMIT 20;
```

Se corre con el embedding de una consulta real y el de una inventada, y el corte
va entre las dos nubes. Se cambia por variable de entorno, sin tocar codigo.

## Overview

Stories get vector embeddings generated from their content (titleLabel + title + summary) using OpenAI's `text-embedding-3-small` model. These embeddings power hybrid semantic+text search on the public API.

## Embedding Generation

### Content Format
```
[Title Label]: [Title]
[Summary]
```
Missing fields are omitted gracefully. If `titleLabel` is null, the title is used alone.

### Content Hash Tracking
A SHA-256 hash of the embedding input string is stored as `embedding_content_hash`. This detects stale embeddings when content changes.

### Trigger Points

Embeddings are generated **before** the state change is committed during assessment. If embedding generation fails (after 3 retries via `withRetry`), the assess operation rolls back. No story reaches `analyzed` without a valid embedding, and since publish requires a prior `analyzed` state, published stories are guaranteed to have embeddings.

1. **On assessment** (`assessStory`): Embedding generated from LLM analysis results, saved atomically with the analysis data
2. **On edit of published story** (`updateStory`): Regenerates if title/titleLabel/summary changed, saved atomically with the edit
3. **Backfill script**: `npm run migration:backfill-embeddings --prefix server` for existing stories

The publish step uses `ensureEmbedding()` / `ensureEmbeddings()` as a safety net. These check if an embedding exists and generate one only if missing (e.g., when an admin manually publishes an unassessed story). For stories that went through the normal pipeline, this is a no-op.

## Hybrid Search (RRF)

When a search query is provided to `getPublishedStories`, the system runs **Reciprocal Rank Fusion** combining:
- **Semantic search**: Top 50 results by cosine similarity (`embedding <=> query_vector`)
- **Text search**: Top 50 results by ILIKE match on title/summary

RRF formula: `score = 1/(60 + semantic_rank) + 1/(60 + text_rank)`

Results appearing in only one search leg still get scored. If semantic search fails (e.g., API error), the system falls back to text-only search.

## Database

### Schema Fields (on `stories` table)
- `embedding` — `vector(1536)` via pgvector
- `embedding_content_hash` — `VARCHAR(64)`, SHA-256 hex of input content
- `embedding_generated_at` — `TIMESTAMP(3)`

### Index
HNSW index for cosine similarity: `stories_embedding_idx`. HNSW was chosen over IVFFlat because it does not require training data and maintains good recall regardless of when it is created. The query must use the `<=>` (cosine distance) operator to use this index.

**Note**: These fields use raw SQL queries (`$queryRaw`/`$executeRaw`) since Prisma's `Unsupported` type has limited query support.

## Configuration

In `server/src/config.ts` under `embedding`:
- `model` — OpenAI model name (default: `text-embedding-3-small`)
- `dimensions` — Vector dimensions (default: `1536`)
- `batchSize` — Stories per API batch call (default: `100`)
- `concurrency` — Parallel batch limit for backfill (default: `5`)
- `delayMs` — Rate limit delay between API calls (default: `100`)

All configurable via `EMBEDDING_*` environment variables.

## Backfill Script

```bash
npm run migration:backfill-embeddings --prefix server              # process all missing
npm run migration:backfill-embeddings:test --prefix server         # dry run (first 3)
npm run migration:backfill-embeddings --prefix server -- --override  # regenerate all
```

Uses raw SQL for fetching (bypasses Prisma type limitations), processes in batches with semaphore-controlled concurrency.

## Key Files

| File | Purpose |
|------|---------|
| `server/src/services/embedding.ts` | Core embedding service (generate, hash, batch) |
| `server/src/services/embedding.test.ts` | Unit tests |
| `server/src/lib/vectors.ts` | Raw SQL embedding persistence (`saveEmbedding`, `saveEmbeddingTx`) |
| `server/src/services/story.ts` | Lifecycle hooks + hybrid search |
| `server/src/services/analysis.ts` | Assessment with atomic embedding save |
| `server/src/scripts/migrations/backfill-embeddings.ts` | Backfill script |
| `server/src/config.ts` | Embedding configuration |
| `server/prisma/schema.prisma` | Schema with pgvector fields |
| `server/prisma/migrations/20260206120000_add_embedding_fields/migration.sql` | DB migration |
