# Semantic Search & Embeddings

> **Spec:** [`.specs/search.allium`](../.specs/search.allium) -- hybrid RRF search, related stories with LRU cache, emotion filtering. This file covers embedding generation, database schema, backfill scripts, and configuration.

## Umbral de relevancia (`SEARCH_MAX_COSINE_DISTANCE`) · calibrado el 2-nov-2026

La busqueda semantica **descarta lo que supera una distancia coseno maxima**,
`config.search.maxCosineDistance`, hoy **0.76**. Y la pierna de texto busca en
espanol **y en ingles** (`title`, `sourceTitle`, `summary`, `titleEn`,
`summaryEn`). Las dos cosas van juntas: ver «Ingles», abajo.

**Historia.** Hasta el 11-sep-2026 no habia filtro: `searchByEmbedding`
devolvia siempre las 50 mas cercanas. Ese dia se puso 1.0, la ortogonalidad,
elegido por geometria y sin datos porque la base esta tras el firewall. Medido
el 2-nov: **1.0 no descartaba nada**. `zzzzzzzzzz`, `qwertzxcvnoexiste`,
`bitcoin` o «receta de pan» devolvian 50 resultados cada una, porque con
`text-embedding-3-small` dos textos sin relacion quedan entre 0,7 y 0,9, casi
nunca en 1,0.

**Como se calibro, sin tocar la base** (`npm run calibrar:busqueda --prefix server -- --dir <carpeta fuera del repo>`,
`server/src/scripts/calibrar-busqueda.ts`):

1. Se bajaron las 4.893 noticias publicadas de la API publica y se replicaron
   sus embeddings con las mismas funciones del servidor (`buildEmbeddingContent`,
   `generateEmbeddingsBatch`). La replica da el mismo orden que el sitio en las
   consultas de control (valida el orden, no las distancias exactas).
2. Se midieron 47 consultas: 20 reales en espanol, 15 en ingles, 6 sin sentido
   y 6 ajenas al sitio. Resultado mas cercano: reales de varias palabras
   0,31-0,55; reales de una palabra «salud» 0,607, «futbol» 0,646, «agua» 0,679,
   «Machi» 0,720; sin sentido 0,734-0,822; ajenas 0,686-0,801.
3. Se calificaron a ciegas 579 pares (dos calificadores por par, sin ver
   distancia ni puesto) en dos rondas:
   - **Ronda 1**, 329 pares: puestos 1-50 con distancia >= 0,60 de 9 consultas
     reales. Acuerdo 98,8 %. («territorio», cuyos 16 pares estan en 0,60-0,61,
     no se etiqueto.)
   - **Ronda 2**, 250 pares, pedida por una revision independiente: la franja
     profunda (puestos > 50 en [0,72, 0,82) de 10 consultas, lo que ve una
     busqueda con filtro de fecha o tema) y 10 consultas en ingles. Acuerdo 100 %.

| Umbral | Ronda 1: pertinentes perdidos (de 154) | Ronda 1: no pertinentes que pasan (de 175) |
|---|---|---|
| 1,00 | 0 | 175 |
| 0,80 | 1 | 114 |
| 0,78 | 4 | 97 |
| **0,76** | **4** | **87** |
| 0,74 | 22,5 | 67,5 |
| 0,70 | 49,5 | 51,5 |

**Por que 0,76.** Es el codo de la ronda 1: por encima, la pertinencia media es
0,043 (92 pares, todos de «futbol» y «Machi»); entre 0,74 y 0,76, 0,49. La ronda 2
lo confirma en diez consultas mas: en la franja profunda, por encima de 0,76 la
pertinencia es 0,066 (106 pares), asi que el corte se sostiene tambien con
filtros. Las consultas sin sentido quedan en 0 salvo `qwertzxcvnoexiste` (2).
«Futbol» baja de 50 resultados semanticos a 6. «Machi» baja de 51 resultados
a 7: 1 semantico y 6 por texto, de los cuales 3 tratan de machi y 3 son falsos
por subcadena («machista», «machismo», «machiguengas»), una limitacion de la
pierna de texto que ya existia.

**Ingles.** Una palabra suelta en ingles queda lejos de los vectores en espanol
aunque trate de lo mismo: «water» esta a 0,767-0,834 de sus 50 mas cercanas,
con 90 % de pertinentes, mas lejos que `qwertzxcvnoexiste` (0,734). **Ninguna
distancia separa una palabra suelta en ingles de un teclazo**, asi que el umbral
la vaciaba, y la pierna de texto, solo en espanol, no la rescataba. Por eso la
pierna de texto busca tambien en `titleEn` y `summaryEn` (57 % de las publicadas
tienen resumen en ingles propio): «water» pasa de 0 resultados semanticos a 50
que dicen «water» literal, «health» de 30 a 50, y las consultas sin sentido
siguen en 0. No son los mismos resultados que se pierden: de los 9 pertinentes
de «water» que corta el umbral en la muestra, 2 aparecen literal. Los titulos
traducidos que manda «Buscar similares» quedan a 0,21-0,34 y no se afectan.

**Datos y candado.** `server/src/lib/calibracion/busqueda-2026-11-02.json`
guarda las distancias de las 47 consultas y los 579 pares con su etiqueta e id.
`vectors-calibracion.test.ts` **es un candado, no una validacion**: el umbral se
eligio con esos mismos datos, y el test impide cambiarlo sin datos nuevos. Falla
si una busqueda sin sentido deja pasar mas de 2, si una real en espanol pierde su
resultado mas cercano, si lo descartado tiene pertinencia sobre 0,10 (0,15 en la
franja profunda) o si se pierde mas del 5 % de los pertinentes. Pasa entre
~0,755 y ~0,775; probado que falla con 1,0, 0,80 y 0,70.

**Limites de la calibracion** (no verificados, exigen leer la base):
- La replica embebe el texto actual. Los scripts que reescriben titulos
  (`backfill-old-story-titles`, `fix-title-capitalization`, `backfill-title-label`,
  `routes/admin/maintenance.ts`) no regeneran el embedding, asi que en la base
  puede haber vectores de un titulo viejo.
- La replica embebe todas las publicadas; la busqueda exige `embedding IS NOT NULL`.
- Con filtro, Postgres puede resolver la pierna semantica con HNSW y post-filtro;
  la franja profunda simula el peor caso (busqueda exacta).
- Las busquedas que enlaza el mapa con el nombre de cada pueblo («Kawesqar»,
  «Yagan», «Selk'nam»…) no se midieron una por una; la pierna de texto no ignora
  tildes ni variantes de grafia.

**Cuando recalibrar.** Si cambia el modelo de embeddings, el texto que se embebe
o el corpus crece mucho. Se corre el script, se califican los pares que escribe
y se ajusta por variable de entorno, sin tocar codigo; despues se reemplaza el
archivo de datos para que el candado siga diciendo la verdad.

**Pasajero, medido el 2-nov:** en una rafaga de 11 busquedas seguidas, «futbol»
dio 3 resultados: la pierna semantica fallo y el sitio respondio solo con
texto, que es el respaldo previsto (`notifyJobFailure` avisa). Repetida minutos
despues, dio lo esperado.

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
- **Text search**: Top 50 results by ILIKE match on title, sourceTitle, summary, titleEn and summaryEn (the English fields since 2-nov-2026, see above)

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
