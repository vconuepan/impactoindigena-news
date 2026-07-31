-- Tabla de tokens sociales de larga duración + seed del job que los renueva.
--
-- Contexto: el token largo de Instagram expiró el 18-jul-2026 y todo el posteo
-- quedó caído 12 días sin aviso. Los tokens largos de Instagram duran 60 días y
-- la Graph API los renueva por otros 60 vía /refresh_access_token, pero el valor
-- renovado es NUEVO y hay que guardarlo en algún lado: el proceso no puede
-- reescribir su propia variable de entorno en App Service. Vive aquí.
--
-- Camino de lectura: DB primero, variable de entorno como respaldo. Tabla vacía
-- significa "seguimos usando INSTAGRAM_ACCESS_TOKEN", así que esta migración es
-- inerte hasta que el job escriba la primera fila.
--
-- El token va en texto plano porque la llamada a la API necesita el valor
-- literal. Misma exposición que la variable de entorno que reemplaza.

CREATE TABLE IF NOT EXISTS "social_tokens" (
  "id"            TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "access_token"  TEXT NOT NULL,
  "expires_at"    TIMESTAMP(3),
  "refreshed_at"  TIMESTAMP(3),
  "last_error"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_tokens_provider_key"
  ON "social_tokens" ("provider");

-- Job diario que renueva el token cuando le quedan pocos días de vida
-- (config.instagram.tokenRefresh.thresholdDays, 15 por defecto) y avisa por
-- correo si ya expiró o si la renovación falla. 05:30 hora del servidor.
-- Habilitado por defecto: es lo que evita que la caída se repita.
-- id usa gen_random_uuid() porque job_runs.id no tiene default en la DB.
-- Seguro de correr varias veces (ON CONFLICT DO NOTHING).

INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'instagram_refresh_token', '30 5 * * *', true, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
