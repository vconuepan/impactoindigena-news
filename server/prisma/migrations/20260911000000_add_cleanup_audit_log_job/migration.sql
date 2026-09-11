-- Agenda el job que poda el registro de actividad (`audit_log`).
--
-- Contexto: hasta el 11-sep-2026 NADA borraba de esa tabla. Crecía sin plazo de
-- conservación guardando `actor_email` e `ip_hash`, ningún camino de baja la
-- alcanzaba, y la sección Conservación de la Política de Privacidad ni la
-- mencionaba. Conservar sin plazo es exactamente lo que prohíbe el principio de
-- proporcionalidad del art. 3 letra c de la Ley 21.719: los datos se conservan
-- «sólo por el período de tiempo que sea necesario para cumplir con los fines
-- del tratamiento».
--
-- El caso extremo lo arregló el código junto con esta migración: el borrado de
-- cuenta escribía el correo del titular en `audit_log` EN EL MISMO ACTO de
-- borrarlo, y como nada purgaba la tabla, ese correo era el único dato suyo que
-- sobrevivía al borrado.
--
-- Por qué hace falta una migración y no basta el seed: `seed-jobs.ts` hace
-- `upsert` con `update: {}`, así que solo crea jobs en entornos que no los
-- tienen, y no corre en el despliegue. Producción ya tiene su `job_runs`
-- poblada. Mismo motivo por el que se agregó así `linkedin_check_token`
-- (migración 20260731000000).
--
-- El plazo lo fija `AUDIT_LOG_RETENTION_DAYS` (365 por defecto) y **debe
-- coincidir con el que declara la Política**, hoy 12 meses. Lo vigila
-- `retencion-declarada.test.ts`, que lee los dos lados.
--
-- Domingos 1:30, media hora después de `cleanup_analytics` para no solaparse.
-- Desde `05f167f` los cron se leen en hora de Chile (America/Santiago).
-- `gen_random_uuid()::text` porque `job_runs.id` es TEXT y no tiene default.
-- Seguro de correr varias veces (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'cleanup_audit_log', '30 1 * * 0', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
