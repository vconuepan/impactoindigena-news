# Job Scheduler

> **Spec:** [`.specs/scheduler.allium`](../.specs/scheduler.allium) -- cron job entity, overlap prevention, overdue detection, hot reload, bulk task lifecycle. This file covers operational details, job registry, concurrency configuration, and admin API.

The scheduler runs jobs in-process using `node-cron`, with configuration and run history stored in the `job_runs` database table. No external job queue infrastructure is needed.

## How It Works

On server startup, `initScheduler()`:
1. Loads all job definitions from the `job_runs` table
2. For each enabled job with a valid cron expression, registers a cron task
3. Checks for overdue jobs (last run + interval < now) and runs them immediately
4. Logs which jobs were registered, skipped, or triggered

## Reliability Features

**Overlap prevention**: Each job checks a running flag before executing. If a previous run is still in progress, the new invocation is skipped.

**Overdue detection**: On startup, the scheduler compares each job's `lastCompletedAt` against its cron interval. Jobs that missed their window (e.g., server was down) run immediately.

**Error tracking**: Each job run updates `lastStartedAt`, `lastCompletedAt`, and `lastError` in the database. Failed jobs don't block subsequent runs.

**Failure notifications**: When a job fails, `notifyJobFailure()` sends a POST to the URL in the `WEBHOOK_URL` environment variable (if set) with the job name, error message, and timestamp. See `server/src/lib/notify.ts`.

**Hot reload**: When a job's cron expression or enabled flag is updated via the admin API (`PUT /api/admin/jobs/:jobName`), the scheduler automatically reloads — stopping all current cron tasks and re-registering from the database. No server restart needed.

**Where the live schedule lives**: in the `job_runs` table, not in the code. `seed-jobs.ts` carries `update: {}` on purpose, so it only inserts jobs that do not exist yet -- editing the seed changes nothing in an environment that already ran it. Two consequences:

- **A cron in `seed-jobs.ts` can silently differ from what production runs.** On 2026-09-07 `social_auto_post` had been re-scheduled from the admin panel months earlier and the file never found out. Read the table before assuming the file is the truth.
- **Hot reload only covers the admin API path.** A schedule written straight to the database -- SQL, a Prisma script -- is invisible to the running process, because `initScheduler()` reads the table once at startup and never re-reads. Such a change needs a process restart; a backend deploy does one. Prefer the admin API, which reprograms in place.

**Cron expressions are read in Chile time** (`America/Santiago`). Both `cron.schedule()` calls in `jobs/scheduler.ts` pass `config.scheduler.timezone`, so what you type in the admin panel is local time -- no mental conversion. Override with `SCHEDULER_TIMEZONE` (e.g. back to `UTC`) without a deploy of new code.

Until 2026-09-08 neither call passed a timezone, so node-cron used the process clock -- UTC on the App Service -- while `/admin/jobs/server-time` reported `America/Santiago`. A schedule edited from the panel ran three or four hours earlier than its author intended.

**Why a timezone and not baked-in arithmetic:** Chile is UTC-3 in summer (from the first Sunday of September) and UTC-4 the rest of the year. Subtracting hours by hand works until April, when every job silently shifts by one hour. With the timezone, 08:00 stays 08:00 year-round.

**Changing the timezone moves every job.** The live schedules are cron strings in `job_runs`, and the timezone decides how they are read -- so the stored values must move in the same maneuver, or every job shifts by the offset.

**Manual triggers**: Every job can be triggered via `POST /api/admin/jobs/:jobName/run`, which runs the job in the background regardless of schedule.

## Registered Jobs

| Job Name | Handler | Default Schedule |
|----------|---------|-----------------|
| `crawl_feeds` | `runCrawlFeeds` | `0 */6 * * *` (every 6h) |
| `preassess_stories` | `runPreassessStories` | Configurable |
| `assess_stories` | `runAssessStories` | Configurable |
| `select_stories` | `runSelectStories` | Configurable |
| `publish_stories` | `runPublishStories` | Configurable |
| `social_auto_post` | `runSocialAutoPost` | Configurable |
| `bluesky_update_metrics` | `runBlueskyUpdateMetrics` | Configurable |
| `mastodon_update_metrics` | `runMastodonUpdateMetrics` | Configurable |
| `generate_newsletter` | `runGenerateNewsletter` | `0 4 * * 6` (Saturday 4am) |
| `cleanup_auth_data` | `runCleanupAuthData` | `0 3 * * *` (daily 3am) — purges expired refresh tokens + magic links (Ley 21.719 storage limitation) |
| `cleanup_subscriptions` | `runCleanupSubscriptions` | `30 3 * * *` (daily 3:30am) — purges unconfirmed expired pending/alert subscriptions |
| `ingest_agenda` | `runIngestAgenda` | Daily — "Incidencia Internacional" ingest (RSS/iCal + OHCHR scrape + LLM enrich) |
| `agenda_weekly_digest` | `runAgendaWeeklyDigest` | `0 9 * * 5` (Friday 9am) — weekly agenda teaser to social channels (once per ISO week) |

## Adding a New Job

1. Create handler in `server/src/jobs/yourJob.ts` exporting an `async function runYourJob(): Promise<void>`
2. Register handler in `server/src/jobs/handlers.ts` by adding to the `JOB_HANDLERS` map
3. Add a row to `job_runs` table (via migration or seed) with `jobName`, `cronExpression`, and `enabled`

## Admin API

| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/jobs` | List all jobs with status, last run times, errors |
| `PUT /api/admin/jobs/:jobName` | Update cron expression or enabled flag |
| `POST /api/admin/jobs/:jobName/run` | Manually trigger a job (runs in background) |

## Concurrency

LLM-powered jobs (preassess, assess, select) process work items in parallel using a counting semaphore to cap concurrent LLM calls. Default concurrency is 10 per job type, configurable via environment variables:

| Env Var | Default | Controls |
|---------|---------|----------|
| `CONCURRENCY_PREASSESS` | 10 | Max concurrent pre-assessment batches |
| `CONCURRENCY_ASSESS` | 10 | Max concurrent full assessments |
| `CONCURRENCY_SELECT` | 10 | Max concurrent selection groups |
| `LLM_DELAY_MS` | 500 | Minimum delay between LLM calls (serialized) |

Set any concurrency to `1` for sequential processing (original behavior). The rate limiter serializes delays across all concurrent workers via a timestamp-based approach (`nextAvailableTime` in `llm.ts`), so each LLM call waits at least `LLM_DELAY_MS` after the previous one regardless of concurrency level. All jobs use `Promise.allSettled` so individual failures don't abort the batch.

The Semaphore utility is at `server/src/lib/semaphore.ts`.

## Key Files

| File | Role |
|------|------|
| `server/src/jobs/scheduler.ts` | Core scheduler: init, cron registration, overlap prevention, hot reload |
| `server/src/jobs/handlers.ts` | Shared `JOB_HANDLERS` map (job name → handler function) |
| `server/src/jobs/jobService.ts` | Service layer for job CRUD and manual triggering |
| `server/src/lib/notify.ts` | Webhook notification for job failures |
| `server/src/jobs/crawlFeeds.ts` | RSS crawl job handler |
| `server/src/jobs/preassessStories.ts` | Pre-assessment job handler |
| `server/src/jobs/assessStories.ts` | Full assessment job handler |
| `server/src/jobs/selectStories.ts` | Selection job handler |
| `server/src/jobs/publishStories.ts` | Publish job handler |
| `server/src/jobs/socialAutoPost.ts` | Unified social media auto-post job handler |
| `server/src/jobs/blueskyAutoPost.ts` | Legacy Bluesky-only auto-post (unused) |
| `server/src/jobs/blueskyUpdateMetrics.ts` | Bluesky metrics update job handler |
| `server/src/jobs/mastodonUpdateMetrics.ts` | Mastodon metrics update job handler |
| `server/src/jobs/generateNewsletter.ts` | Automated weekly newsletter generation job handler |
| `server/src/routes/admin/jobs.ts` | Admin API for job management |
