# Context (`.context/`)

Implementation reference docs for building, modifying, and operating each subsystem.

## Purpose

Context files explain **how the system is built** -- file locations, API endpoints, configuration, workflows, troubleshooting, and modification guides. They are the practical companion to the codebase.

A context file answers: "How do I work with this?" Not "What should it do?"

## Boundary Rules

- **Include:** File paths, API endpoints, environment variables, CLI commands, database schema details, framework patterns, UI component structure, modification guides, operational runbooks
- **Exclude:** Behavioral rules, state transition logic, invariants, entity definitions (these belong in `.specs/`)

Brief summaries of behavioral rules are acceptable when they provide context for the implementation details that follow, but the spec is always the authoritative source for behavior.

## Conventions

- Filename matches the subsystem: `authentication.md`, `story-pipeline.md`
- Files with a spec counterpart start with a cross-reference header pointing to the authoritative spec
- "Key Files" or "File Locations" table at the end
- "Modifying" section when the subsystem has non-obvious change points

## Index

Every file in this directory, grouped by area. The **Spec** column names the
authoritative `.specs/` file when the subsystem has one: where they disagree, the
spec wins and the context file is what gets corrected.

### Editorial pipeline

| File | Covers | Spec |
|---|---|---|
| `story-pipeline.md` | Status transitions, jobs, admin endpoints, slugs, field reference | `story-pipeline.allium` |
| `content-extraction.md` | 3-tier extraction chain, crawl flow, resource limits, adding feeds | `crawl-and-extraction.allium` |
| `llm-analysis.md` | Model tiers, prompt directory, schema-driven format, analysis stages | — |
| `prompting.md` | GPT-5 prompt conventions. **Read before modifying any prompt** | — |
| `dedup.md` | Cluster model, pipeline integration, admin clusters page | `dedup.allium` |
| `embeddings.md` | Trigger points, hybrid RRF search, backfill script | `search.allium` |
| `task-queue.md` | Bulk LLM operations, polling, processing indicators | `scheduler.allium` |
| `scheduler.md` | Job registry, overlap prevention, concurrency, admin API | `scheduler.allium` |

### Distribution

| File | Covers | Spec |
|---|---|---|
| `newsletter-podcast.md` | Create-assign-generate workflow, templates, carousel | `newsletter-and-podcast.allium` |
| `bluesky.md` | AT Protocol auth, post format, auto-post, metrics | `social-posting.allium` |
| `mastodon.md` | Static token auth, shared social logic, post format | `social-posting.allium` |
| `instagram.md` | Graph API auth, carousel vs single-image, R2 dependency, token rotation | `social-posting.allium` |
| `linkedin.md` | Member token (60d, no automatic refresh), OAuth reauthorization, check job | `social-posting.allium` |
| `twitter.md` | OAuth 1.0a static credentials, text reused from Bluesky, admin panel | `social-posting.allium` |
| `facebook.md` | Page token vs Instagram token, link-card posting, groups impossible | `social-posting.allium` |

### Interface

| File | Covers | Spec |
|---|---|---|
| `public-website.md` | Routes, positivity slider, RSS feeds, design system | — |
| `admin-dashboard.md` | TanStack Query patterns, URL-persisted filters, bulk actions | — |
| `ui-conventions.md` | SEO checklist, CSS classes, bundle splitting, accessibility, spelling | — |
| `accessibility.md` | Full WCAG 2.2 AA patterns, ARIA, forms, testing checklist | — |
| `seo.md` | Sitemap, Azure rewrites, robots.txt, route registration | — |
| `images.md` | WebP optimization, size presets, CLI commands | — |

The client has one context file of its own: `client/.context/skeletons.md`, on
skeleton components for loading states.

### Platform

| File | Covers | Spec |
|---|---|---|
| `authentication.md` | JWT flow, cookie config, token rotation, roles | `authentication.allium` |
| `database-migrations.md` | SQL-first migration workflow, allowed and banned commands | — |
| `logging.md` | Pino config, error serialization, structured data, log levels | — |
| `security-audit-2026-05-04.md` | Point-in-time audit. **Historical record, not current state** | — |

Two specs have no context file of their own, because their implementation is
covered across the files above: `feed-management.allium` and
`subscription.allium`.

## Relationship to `.specs/`

When a topic has both a spec and a context file, the spec defines the **contract** (what must be true) and the context explains the **implementation** (how it's achieved). If they conflict, update the context to match the spec. Some topics exist only in `.context/` because they are purely operational (migrations, logging) or frontend-specific (admin-dashboard, accessibility).
