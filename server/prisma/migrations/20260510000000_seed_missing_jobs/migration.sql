-- Seed missing job_runs entries that exist in handlers.ts but were never inserted.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- Also seeds the full baseline in case job_runs was ever emptied.

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  -- Pipeline
  (gen_random_uuid()::text, 'crawl_feeds',            '0 */6 * * *',       false, NOW(), NOW()),
  (gen_random_uuid()::text, 'preassess_stories',      '0 1,7,13,19 * * *', false, NOW(), NOW()),
  (gen_random_uuid()::text, 'assess_stories',         '0 9,21 * * *',      false, NOW(), NOW()),
  (gen_random_uuid()::text, 'select_stories',         '0 10 * * *',        false, NOW(), NOW()),
  (gen_random_uuid()::text, 'publish_stories',        '0 11 * * *',        false, NOW(), NOW()),
  -- Social
  (gen_random_uuid()::text, 'social_auto_post',       '30 11 * * *',       false, NOW(), NOW()),
  (gen_random_uuid()::text, 'bluesky_update_metrics', '0 */6 * * *',       false, NOW(), NOW()),
  (gen_random_uuid()::text, 'mastodon_update_metrics','0 4 * * *',         false, NOW(), NOW()),
  (gen_random_uuid()::text, 'instagram_update_metrics','0 */6 * * *',      false, NOW(), NOW()),
  (gen_random_uuid()::text, 'linkedin_update_metrics','0 */6 * * *',       false, NOW(), NOW()),
  -- Newsletter
  (gen_random_uuid()::text, 'generate_newsletter',    '0 4 * * 6',         false, NOW(), NOW()),
  (gen_random_uuid()::text, 'send_newsletter',        '0 12 * * 1',        false, NOW(), NOW()),
  (gen_random_uuid()::text, 'send_private_newsletter','30 12 * * 1',       false, NOW(), NOW()),
  (gen_random_uuid()::text, 'send_community_digest',  '0 8 * * 1',         true,  NOW(), NOW()),
  (gen_random_uuid()::text, 'send_alerts',            '0 9 * * *',         true,  NOW(), NOW()),
  -- Content
  (gen_random_uuid()::text, 'generate_editorial',     '0 5 * * 0',         false, NOW(), NOW()),
  (gen_random_uuid()::text, 'scrape_docip',           '0 2 * * *',         false, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
