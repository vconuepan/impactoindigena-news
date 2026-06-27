-- Seed job_runs entries for the data-retention cleanup jobs (Ley 21.719,
-- conservación limitada + deber de seguridad Art. 14 quinquies). These jobs
-- exist as handlers in handlers.ts but were never scheduled, so expired
-- refresh tokens, magic links, and unconfirmed double opt-ins accumulated
-- indefinitely. Enabled by default — they are idempotent maintenance.
-- id uses gen_random_uuid() since job_runs.id has no DB-level default
-- (Prisma generates it). Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'cleanup_auth_data',     '0 3 * * *',  true, NOW(), NOW()),
  (gen_random_uuid()::text, 'cleanup_subscriptions', '30 3 * * *', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
