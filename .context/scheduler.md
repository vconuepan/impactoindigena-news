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
