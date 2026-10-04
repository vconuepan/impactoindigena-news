-- Retención por vertical (D4 del programa Las Otras Voces).
-- Diseño: .plans/2026-10-04_retencion-por-vertical.md
--
-- Una nota puede estar publicada en Voces Indígenas (la casa grande) y retenida
-- en Voces Mapuche o Voces Araucanía hasta que un editor la libere. Para eso:
--
--   community_review_modes   el interruptor de cada vertical: off | shadow | enforce.
--                            SIN FILA = off. Por eso esta migración es inerte:
--                            ninguna vertical cambia hasta que el director inserte
--                            un modo. Va en tabla propia y NO como columna de
--                            communities a propósito: el despliegue regenera el
--                            cliente Prisma pero no aplica migraciones
--                            (deploy-azure.yml), y una columna nueva en un modelo
--                            existente haría fallar prisma.community.findMany()
--                            si el código llegara antes que este SQL.
--
--   story_community_reviews  una fila por (nota, vertical). Separa lo que dijo la
--                            máquina (gate_*), que se reescribe al reevaluar, de lo
--                            que decidió una persona (released/held), que la
--                            máquina NUNCA pisa.
--
-- TEXT + CHECK en lugar de tipos enum de Postgres: el SQL escrito a mano y el
-- schema.prisma no pueden desincronizarse por un ALTER TYPE olvidado. Los ids
-- son TEXT porque stories.id, communities.id y job_runs.id lo son.
--
-- Seguro de correr varias veces (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- La aplica el director en pgAdmin; luego:
--   npm run db:migrate:resolve --prefix server -- --applied 20261004000000_add_story_community_reviews

CREATE TABLE IF NOT EXISTS "community_review_modes" (
  "community_id" TEXT NOT NULL,
  "mode"         TEXT NOT NULL,
  "updated_by"   TEXT,          -- users.id sin FK: el rastro sobrevive al borrado de la cuenta
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_review_modes_pkey" PRIMARY KEY ("community_id"),
  CONSTRAINT "community_review_modes_mode_check" CHECK ("mode" IN ('off', 'shadow', 'enforce'))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_review_modes_community_id_fkey') THEN
    ALTER TABLE "community_review_modes"
      ADD CONSTRAINT "community_review_modes_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "story_community_reviews" (
  "id"                 TEXT NOT NULL,
  "story_id"           TEXT NOT NULL,
  "community_id"       TEXT NOT NULL,

  -- Lo que dijo la máquina. Se reescribe en cada reevaluación.
  "gate_decision"      TEXT NOT NULL,
  "gate_reasons"       TEXT[] NOT NULL DEFAULT '{}',
  "gate_signals"       TEXT[] NOT NULL DEFAULT '{}',
  "gate_score"         SMALLINT NOT NULL DEFAULT 0,
  "gate_learning_mode" BOOLEAN NOT NULL,
  "gate_text_source"   TEXT NOT NULL,
  "gate_version"       TEXT NOT NULL,
  "gate_evaluated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Estado de la nota en ESTA vertical. La máquina solo escribe auto y pending;
  -- released y held los escribe una persona y ninguna reevaluación los pisa.
  "review_state"       TEXT NOT NULL,
  "review_code"        TEXT,         -- 'sensitive' | 'out_of_scope': alimenta el criterio por marca (D5)
  "review_note"        TEXT,
  "reviewed_by"        TEXT,         -- users.id sin FK, igual que audit_log
  "reviewed_at"        TIMESTAMP(3),

  -- Fecha de publicación en ESTA vertical: pubDate del RSS y del news-sitemap del
  -- dominio de la marca. Se fija una sola vez y nunca vuelve a null.
  "published_at"       TIMESTAMP(3),

  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "story_community_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "story_community_reviews_gate_decision_check" CHECK ("gate_decision" IN ('auto_publish', 'held_for_review')),
  CONSTRAINT "story_community_reviews_gate_text_source_check" CHECK ("gate_text_source" IN ('short', 'full')),
  CONSTRAINT "story_community_reviews_review_state_check" CHECK ("review_state" IN ('auto', 'pending', 'released', 'held')),
  CONSTRAINT "story_community_reviews_review_code_check" CHECK ("review_code" IS NULL OR "review_code" IN ('sensitive', 'out_of_scope'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_community_reviews_story_id_community_id_key"
  ON "story_community_reviews" ("story_id", "community_id");
-- La cola del editor: por vertical y estado, ordenada por fuerza de la señal.
CREATE INDEX IF NOT EXISTS "story_community_reviews_queue_idx"
  ON "story_community_reviews" ("community_id", "review_state", "gate_score" DESC);
CREATE INDEX IF NOT EXISTS "story_community_reviews_story_id_idx"
  ON "story_community_reviews" ("story_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_community_reviews_story_id_fkey') THEN
    ALTER TABLE "story_community_reviews"
      ADD CONSTRAINT "story_community_reviews_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_community_reviews_community_id_fkey') THEN
    ALTER TABLE "story_community_reviews"
      ADD CONSTRAINT "story_community_reviews_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- El conciliador horario nace DESHABILITADO: lo enciende el director cuando las
-- verticales estén en sombra y la carga inicial esté hecha (diseño, sección 8).
-- Hace falta aquí y no basta seed-jobs.ts porque el seed no corre en el despliegue.
INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'reconcile_community_reviews', '17 * * * *', false, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;
