-- Agenda el job que vigila el token de LinkedIn.
--
-- Contexto: el token de LinkedIn expiró en algún momento antes del 11-jun-2026.
-- Ese día un intento manual de publicar murió con 401 EXPIRED_ACCESS_TOKEN y el
-- canal quedó caído sin que nada lo notara. Nadie se enteró porque NINGUNA ruta
-- automática ejercía el token: `linkedin_update_metrics` corre cuatro veces al
-- día, pero cuando el autor es un perfil personal (urn:li:person:...) sale
-- temprano sin llamar a la API. Peor que el caso de Instagram, donde el job al
-- menos llamaba y se tragaba el error.
--
-- A diferencia de `instagram_refresh_token`, este job NO renueva nada: los
-- refresh tokens programáticos de LinkedIn son solo para partners aprobados del
-- Marketing Developer Platform, así que la renovación exige que un humano
-- reautorice. El job introspecciona el token a diario y falla ruidosamente
-- cuando ya no sirve o cuando le quedan pocos días
-- (config.linkedin.tokenCheck.thresholdDays, 7 por defecto), de modo que llegue
-- la alerta del scheduler. Se reautoriza de un clic en Panel → LinkedIn.
--
-- 06:00 hora del servidor, media hora después del de Instagram para no solapar.
-- Habilitado por defecto: es lo que evita que la caída se repita.
-- id usa gen_random_uuid() porque job_runs.id no tiene default en la DB.
-- Seguro de correr varias veces (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'linkedin_check_token', '0 6 * * *', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
