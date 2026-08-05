-- Canal de Facebook Páginas: tabla de posts + los dos jobs que lo sostienen.
--
-- Por qué Páginas y no grupos: Meta cerró la Groups API (`publish_to_groups`) en
-- abril de 2024, así que publicar en un grupo por API es imposible, no difícil.
-- Una Página sí se puede, con un Page Access Token.
--
-- No hay columna de imagen a propósito. Un post de Página es texto + enlace, y
-- Facebook arma la tarjeta con la og:image del artículo (que el sitio ya genera y
-- rehospeda en R2 desde el PR #7). Subir la imagen aparte daría una foto que no
-- lleva a ninguna parte al hacer clic.
--
-- El token de Instagram NO sirve acá: ese usa graph.instagram.com (Instagram
-- Login) y este necesita graph.facebook.com con un token de Página. Se guarda en
-- `social_tokens` con provider='facebook', igual que los otros dos.
--
-- Seguro de correr varias veces (IF NOT EXISTS / ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS "facebook_posts" (
  "id"                 TEXT NOT NULL,
  "story_id"           TEXT NOT NULL,
  "facebook_post_id"   TEXT,
  "permalink"          TEXT,
  "status"             TEXT NOT NULL DEFAULT 'draft',
  "post_text"          TEXT NOT NULL,
  "error"              TEXT,
  "published_at"       TIMESTAMP(3),
  "like_count"         INTEGER NOT NULL DEFAULT 0,
  "comment_count"      INTEGER NOT NULL DEFAULT 0,
  "share_count"        INTEGER NOT NULL DEFAULT 0,
  "metrics_updated_at" TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "facebook_posts_pkey" PRIMARY KEY ("id")
);

-- Un post por historia, como en los otros cinco canales.
CREATE UNIQUE INDEX IF NOT EXISTS "facebook_posts_story_id_key"
  ON "facebook_posts" ("story_id");

CREATE UNIQUE INDEX IF NOT EXISTS "facebook_posts_facebook_post_id_key"
  ON "facebook_posts" ("facebook_post_id");

CREATE INDEX IF NOT EXISTS "facebook_posts_status_idx"
  ON "facebook_posts" ("status");

CREATE INDEX IF NOT EXISTS "facebook_posts_published_at_idx"
  ON "facebook_posts" ("published_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facebook_posts_story_id_fkey'
  ) THEN
    ALTER TABLE "facebook_posts"
      ADD CONSTRAINT "facebook_posts_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- La tabla de tokens la crean las migraciones de Instagram y LinkedIn. Se repite
-- con IF NOT EXISTS para que esta entre en cualquier orden y no dependa de ellas.
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

-- Dos jobs:
--   facebook_check_token   — 06:30, media hora después del de LinkedIn para no
--                            solaparse. Introspecciona vía /debug_token y falla
--                            ruidosamente si el token murió o le quedan pocos
--                            días. Un token de Página derivado de un user token
--                            expira; uno de system user no, y en ese caso el job
--                            no alerta nunca (no hay fecha que vigilar).
--   facebook_update_metrics — deshabilitado, igual que los otros de métricas: se
--                            enciende cuando el canal ya publica.
INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'facebook_check_token',   '30 6 * * *',  true,  NOW(), NOW()),
  (gen_random_uuid()::text, 'facebook_update_metrics', '0 */6 * * *', false, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
