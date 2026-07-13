-- Seed the job_runs entry for the weekly "Incidencia Internacional" digest
-- (Fase 3). Posts a count-based teaser of this week's events / calls /
-- opportunities / publications to social channels, linking back to
-- /incidencia-internacional. Handler: agenda_weekly_digest (handlers.ts).
-- Friday 09:00 server time. Enabled by default; the handler no-ops on an empty
-- week and dedupes to at most one post per ISO week.
-- id uses gen_random_uuid() since job_runs.id has no DB-level default.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'agenda_weekly_digest', '0 9 * * 5', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
