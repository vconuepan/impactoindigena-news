# Impacto Indígena

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `DESIGN.md`.

AI-curated news platform that evaluates article relevance to humanity using LLM analysis. Crawls news sources, assesses relevance, and publishes curated content.

**Live site:** https://impactoindigena.news

## Implementation Workflow

**IMPORTANT**: Unless specified otherwise, follow the process outlined in the `/workflow` skill.

**Allium specs in the workflow:** During the **Planning** step, read the relevant `.specs/*.allium` file(s) for any subsystem the task touches. The spec defines what the system guarantees; plans should respect those contracts or explicitly propose changes. During **Documentation**, if the implementation changed domain behavior (new rules, modified transitions, new entities), update the affected spec using the `/allium` skill. Context files only need updating when implementation details change.

## Project Structure

```
actually-relevant/
├── client/          # React frontend (Vite + TypeScript + Tailwind)
├── server/          # Express backend (Prisma + LangChain + OpenAI)
├── shared/          # Shared types and constants
├── .specs/          # Behavioral specs (allium) -- what the system guarantees
├── .context/        # Implementation reference -- how it's built and operated
├── .plans/          # Active development plans
│   └── completed/   # Archive of all past plans (70+ files)
├── BACKLOG.md       # Deferred features
├── CLAUDE.md        # This file
└── README.md        # Project documentation
```

## Tech Stack

**Frontend:** Vite + React 18 + TypeScript, Tailwind CSS, react-helmet-async + @prerenderer, Vitest + RTL

**Backend:** Express + TypeScript, PostgreSQL + pgvector (Prisma ORM), LangChain + OpenAI (structured output with Zod), node-cron, Zod

**Deployment:** Render.com (static site + web service + PostgreSQL)

## Commands

**Assume the client dev server is already running** -- do not start it yourself. Use Playwright to verify visual changes.

Use `--prefix` for all npm commands:

```bash
npm run dev --prefix client           # Start client dev server
npm run build --prefix client         # Build (includes prerendering)
npm run test --prefix client -- --run # Run client tests
npm run dev --prefix server           # Start server with hot reload
npm run build --prefix server         # Build server
npm run test --prefix server          # Run server tests
```

### Database

```bash
npm run db:migrate --prefix server    # Run Prisma migrations
npm run db:generate --prefix server   # Generate Prisma client
npm run db:studio --prefix server     # Open Prisma Studio
```

**IMPORTANT database rules:**
- **Never use `npx prisma` directly** -- always use `npm run db:*` with `--prefix server`. Direct `npx prisma` skips `.env` and fails.
- **Never run `prisma migrate dev`** -- generate SQL manually, user runs it in pgAdmin. See `.context/database-migrations.md`.
- **Never pass `--no-engine` to `prisma generate`** -- breaks all direct PostgreSQL queries.
- **`db:generate` requires the dev server to be stopped** -- `prisma generate` replaces a DLL that is locked while the server runs. Ask user to stop first.

## Key Conventions

- **Prefer file tools over bash** -- Use Read, Write, Edit, Glob, Grep instead of cat, sed, grep, find.
- **Server config** -- All tunable constants centralized in `server/src/config.ts` with env var overrides.
- **Logging** -- Use `createLogger('module')` from `server/src/lib/logger.ts`. Never `console.log` in application code (scripts exempt). See `.context/logging.md`.
- **Prompts** -- Read `.context/prompting.md` before modifying any prompt in `server/src/prompts/`. GPT-5 conventions (declarative constraints, XML scaffolding).
- **Retry logic** -- External HTTP and LLM calls must use `withRetry()` from `server/src/lib/retry.ts`.
- **American English** -- All UI text uses American English spelling ("analyzed" not "analysed").
- **Em dashes** -- One per paragraph max in user-facing copy.
- **Completed plans as context** -- `.plans/completed/` has 70+ plans. Search by topic before asking the user.

## Resilience

- **Retry logic**: `withRetry()` (3 attempts, exponential backoff) for HTTP and LLM calls.
- **Graceful shutdown**: `server/src/index.ts` handles `SIGTERM`/`SIGINT`.
- **Global error handler**: `server/src/app.ts` catches Prisma `P2025`/`P2002` and known service errors.
- **Request correlation**: Every request gets `X-Request-Id` header.
- **Health check**: `GET /health` verifies DB connectivity.

## API Documentation

- **OpenAPI spec** generated from Zod schemas in `server/src/lib/openapi.ts`
- When adding/modifying public API endpoints: update Zod schema, route definition in `openapi.ts`, add `.openapi()` metadata
- Verify with `npm run build --prefix server`

## Known Issues

- **Prisma client out of sync**: TS errors for `clusterId`, `storyCluster`, etc. are pre-existing. Fix: `npm run db:generate --prefix server`.
- **clusters.test.ts**: Pre-existing failure (`html-encoding-sniffer` ESM compat). Not code-related.
- **Windows vitest teardown**: `kill EPERM` errors are normal on Windows.

## UI & Testing Patterns

- **UI conventions** -- See `.context/ui-conventions.md` for SEO checklist, CSS utility classes, bundle splitting rules, accessibility requirements, and spelling rules.
- **Admin side panels**: `EditPanel` with `PANEL_BODY`/`PANEL_FOOTER` CSS classes.
- **Toast provider**: Components using `useToast()` need `<ToastProvider>` in tests.
- **Headless UI dialogs**: Use `getByRole('heading', { name: ... })` to disambiguate from buttons.
- **URL-persisted state**: Admin pages use `useSearchParams()` for state (e.g., `?open=id`).
- **Server tests**: `vi.hoisted()` for mocks, `supertest` + `authHeader()` for route tests.

## Project Management (`pm/`)

Separate git repo for marketing, research, strategy. **Never write, edit, or create files in `pm/`**. Read only.

Key dirs: `pm/state/` (business context), `pm/backlog/` (priorities), `pm/plans/` (active/completed plans), `pm/references/` (research).

## Spec Files (`.specs/`)

Behavioral specifications defining domain rules, entities, and invariants in Allium. **Authoritative source for what the system guarantees.** See `.specs/README.md` for conventions.

Covers: story-pipeline, crawl-and-extraction, authentication, scheduler (includes task queue), feed-management, newsletter-and-podcast, social-posting, search, dedup, subscription.

## Context Files (`.context/`)

Implementation reference docs. **Read the relevant file before modifying a subsystem.** See `.context/README.md` for conventions. Files with a spec counterpart include a cross-reference header; the spec is authoritative.

| File | Topic |
|------|-------|
| `story-pipeline.md` | Status transitions, jobs, admin endpoints, slugs, field reference |
| `content-extraction.md` | 3-tier extraction chain, crawl flow, resource limits, adding feeds |
| `llm-analysis.md` | Model tiers, prompt directory, schema-driven format, analysis stages |
| `prompting.md` | GPT-5 prompt conventions (read before modifying prompts) |
| `scheduler.md` | Job registry, overlap prevention, concurrency, admin API |
| `task-queue.md` | Bulk LLM operations, polling, processing indicators |
| `newsletter-podcast.md` | Create-assign-generate workflow, templates, carousel |
| `authentication.md` | JWT flow, cookie config, token rotation, roles |
| `admin-dashboard.md` | TanStack Query patterns, URL-persisted filters, bulk actions |
| `public-website.md` | Routes, positivity slider, RSS feeds, design system |
| `dedup.md` | Cluster model, pipeline integration, admin clusters page |
| `embeddings.md` | Trigger points, hybrid RRF search, backfill script |
| `ui-conventions.md` | SEO checklist, CSS classes, bundle splitting, accessibility, spelling |
| `accessibility.md` | Full WCAG 2.2 AA patterns, ARIA, forms, testing checklist |
| `seo.md` | Sitemap, Render rewrites, robots.txt, route registration |
| `images.md` | WebP optimization, size presets, CLI commands |
| `logging.md` | Pino config, error serialization, structured data, log levels |
| `database-migrations.md` | SQL-first migration workflow, allowed/banned commands |
| `bluesky.md` | AT Protocol auth, post format, auto-post, metrics |
| `mastodon.md` | Static token auth, shared social logic, post format |
| `instagram.md` | Graph API auth, carousel vs single-image, R2 dependency, token rotation |
| `client/.context/skeletons.md` | Skeleton components for loading states (prevents CLS) |

## Memory

All project memory lives in this `CLAUDE.md` file. Do not use or update the auto-memory file under `~/.claude/projects/`.

## Maintaining This File

Before restructuring or adding to this file, review [Anthropic's best practices](https://code.claude.com/docs/en/best-practices) (see "Write an effective CLAUDE.md"). Key rule: for each line, ask "would removing this cause Claude to make mistakes?" If not, cut it or move it to a `.context/` file.
