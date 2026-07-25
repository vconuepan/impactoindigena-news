-- Seed the job_runs entry for cleanup_analytics (handler en handlers.ts).
-- Suprime las filas de daily_visitors más antiguas que
-- config.analytics.visitorRetentionDays (365 días por defecto), cumpliendo el
-- principio de proporcionalidad de la Ley 21.719 (art. 3 letra c): conservar
-- sólo por el tiempo necesario, luego suprimir o anonimizar. El plazo debe
-- coincidir con el declarado en la Política de Privacidad.
-- Domingos 04:00 hora del servidor. Habilitado por defecto (es una obligación
-- de retención, no una función opcional).
-- id usa gen_random_uuid() porque job_runs.id no tiene default en la DB.
-- Seguro de correr varias veces (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'cleanup_analytics', '0 4 * * 0', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
