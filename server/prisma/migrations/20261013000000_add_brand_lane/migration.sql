-- Criterio por marca (D5 del programa Las Otras Voces), aprobado por el director
-- el 12-oct-2026 («sí a las cinco»).
--
-- Un carril lateral que solo suma: toma lo que el pipeline global ya rechazó, lo
-- juzga con el criterio de cada marca y lo guarda en tablas propias. NUNCA cambia
-- stories.status ni su relevancia, así que Voces Indígenas y toda superficie
-- global (portada, RSS global, búsqueda, sitemaps, boletines) quedan idénticas:
-- todas filtran status = 'published', y lo del carril sigue 'rejected'.
--
--   community_brand_criteria   el interruptor y los parámetros de cada vertical
--                              con criterio propio. SIN FILA = apagada. Las
--                              filas se siembran en 'off': esta migración es
--                              inerte. Las pautas editoriales (escala, regla de
--                              entrada, tensiones) NO van aquí: el repo es
--                              público y el director las carga aparte.
--
--   feed_brands                qué feeds son fuente de candidatas de una
--                              vertical (los municipales no siempre nombran la
--                              comuna en el titular). Con FK, no como texto, por
--                              la lección de los issue_ids fantasma.
--
--   story_brand_assessments    el juicio de marca de cada nota: admitida o no,
--                              puntaje de marca, eje, señales sensibles, estado
--                              propio y el título y resumen que se muestran en la
--                              vertical cuando la nota entra solo por la marca.
--
--   brand_lane_calls           una fila por cada llamada al modelo, escrita ANTES
--                              de llamar. El tope diario se cuenta aquí: ni un
--                              lote que falla y se rejuzga, ni una escritura que
--                              falla después de pagar, quedan fuera de la cuenta
--                              (revisión del 13-oct-2026).
--
-- Nada se agrega a stories ni a StoryStatus: un ALTER TYPE ... ADD VALUE no se
-- deshace y una columna nueva en un modelo existente rompe findMany() si el
-- código llega antes que este SQL. Estas tablas se borran con DROP TABLE y la
-- base queda como estaba.
--
-- TEXT + CHECK en lugar de enums, ids TEXT (como stories, communities, feeds).
-- Seguro de correr varias veces (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- La aplica el director; luego:
--   npm run db:migrate:resolve --prefix server -- --applied 20261013000000_add_brand_lane

-- Verificación ANTES (esperado: 0 0 0 0 si es la primera vez).
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'community_brand_criteria') AS criteria,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'feed_brands') AS feed_brands,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'story_brand_assessments') AS assessments,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'brand_lane_calls') AS calls;

CREATE TABLE IF NOT EXISTS "community_brand_criteria" (
  "community_id"       TEXT NOT NULL,
  "criterion"          TEXT NOT NULL,
  "mode"               TEXT NOT NULL DEFAULT 'off',
  "rescue_mode"        TEXT NOT NULL DEFAULT 'off',   -- solo Voces Mapuche: rescate de lo que descarta el selector global
  "guidelines"         TEXT NOT NULL DEFAULT '',      -- pautas de la marca; las carga el director (repo privado)
  "guidelines_version" INTEGER NOT NULL DEFAULT 0,
  "relevance_min"      SMALLINT NOT NULL,
  "daily_target"       SMALLINT NOT NULL DEFAULT 0,
  "balance"            JSONB NOT NULL DEFAULT '{}',
  "daily_call_cap"     SMALLINT NOT NULL DEFAULT 20,
  "updated_by"         TEXT,                          -- users.id sin FK, como audit_log
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_brand_criteria_pkey" PRIMARY KEY ("community_id"),
  CONSTRAINT "community_brand_criteria_criterion_check" CHECK ("criterion" IN ('territorial', 'escala_mapuche')),
  CONSTRAINT "community_brand_criteria_mode_check" CHECK ("mode" IN ('off', 'shadow', 'enforce')),
  CONSTRAINT "community_brand_criteria_rescue_mode_check" CHECK ("rescue_mode" IN ('off', 'shadow', 'enforce')),
  CONSTRAINT "community_brand_criteria_relevance_min_check" CHECK ("relevance_min" BETWEEN 1 AND 10),
  CONSTRAINT "community_brand_criteria_daily_call_cap_check" CHECK ("daily_call_cap" BETWEEN 0 AND 200)
);

CREATE TABLE IF NOT EXISTS "feed_brands" (
  "feed_id"      TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feed_brands_pkey" PRIMARY KEY ("feed_id", "community_id")
);

CREATE TABLE IF NOT EXISTS "story_brand_assessments" (
  "id"                     TEXT NOT NULL,
  "story_id"               TEXT NOT NULL,
  "community_id"           TEXT NOT NULL,

  -- Por qué la nota es candidata.
  "source_signal"          TEXT NOT NULL,
  "matched_terms"          TEXT[] NOT NULL DEFAULT '{}',

  -- El juicio del modelo. Describe la nota, nunca a una persona: ningún campo
  -- infiere la pertenencia a un pueblo ni la posición política de nadie.
  "admitted"               BOOLEAN,
  "admission_reason"       TEXT,                       -- sin nombres de personas (verificación determinista en el código)
  "brand_score"            SMALLINT,
  "axis"                   TEXT,
  "place"                  TEXT,
  "sensitive_flags_judge"  TEXT[] NOT NULL DEFAULT '{}',
  "sensitive_flags_filter" TEXT[] NOT NULL DEFAULT '{}',

  -- Estado propio de la marca.
  "state"                  TEXT NOT NULL DEFAULT 'candidate',
  "discard_reason"         TEXT,

  -- Lo que muestra la vertical cuando la nota entra SOLO por la marca.
  "brand_title"            TEXT,
  "brand_summary"          TEXT,
  "brand_slug"             TEXT,
  "brand_date"             TIMESTAMP(3),

  -- Trazabilidad y costo (el tope diario se cuenta aquí, no en memoria).
  "guidelines_version"     INTEGER,
  "model"                  TEXT,
  "batch_id"               TEXT,
  "attempts"               SMALLINT NOT NULL DEFAULT 0,
  "last_error"             TEXT,
  "tokens_in"              INTEGER,
  "tokens_out"             INTEGER,
  "evaluated_at"           TIMESTAMP(3),
  "redacted_at"            TIMESTAMP(3),
  "selected_at"            TIMESTAMP(3),
  "published_at"           TIMESTAMP(3),
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "story_brand_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "story_brand_assessments_source_signal_check" CHECK ("source_signal" IN ('term', 'feed', 'keyword', 'rescue')),
  CONSTRAINT "story_brand_assessments_brand_score_check" CHECK ("brand_score" IS NULL OR "brand_score" BETWEEN 1 AND 10),
  CONSTRAINT "story_brand_assessments_axis_check" CHECK ("axis" IS NULL OR "axis" IN (
    -- Voces Araucanía: las tres tensiones del marco y la región completa del protocolo 1.1
    -- y la crónica policial con eje propio (decisión del director del 13-oct-2026)
    'mapuche_chileno', 'regionalismo_centralismo', 'pobreza_desarrollo', 'region_completa', 'seguridad',
    -- Voces Mapuche: los cinco ejes del director a 7-8, y el resto de la escala
    'lengua', 'saber', 'economia_propia', 'propuestas', 'protagonismo',
    'territorio_derechos', 'conflicto', 'vida_urbana', 'otro'
  )),
  CONSTRAINT "story_brand_assessments_state_check" CHECK ("state" IN ('candidate', 'evaluated', 'discarded', 'selected', 'published')),
  CONSTRAINT "story_brand_assessments_discard_reason_check" CHECK ("discard_reason" IS NULL OR "discard_reason" IN (
    'not_admitted', 'below_min', 'quota', 'duplicate', 'manual_reject', 'language', 'error'
  )),
  CONSTRAINT "story_brand_assessments_attempts_check" CHECK ("attempts" BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_brand_assessments_story_id_community_id_key"
  ON "story_brand_assessments" ("story_id", "community_id");
CREATE UNIQUE INDEX IF NOT EXISTS "story_brand_assessments_brand_slug_key"
  ON "story_brand_assessments" ("brand_slug");
-- La selección y la vertical: por comunidad y estado, de la nota de marca más alta a la más baja.
CREATE INDEX IF NOT EXISTS "story_brand_assessments_selection_idx"
  ON "story_brand_assessments" ("community_id", "state", "brand_score" DESC);
-- Juicios por comunidad y día (métricas de la sombra).
CREATE INDEX IF NOT EXISTS "story_brand_assessments_calls_idx"
  ON "story_brand_assessments" ("community_id", "evaluated_at");

CREATE TABLE IF NOT EXISTS "brand_lane_calls" (
  "id"           TEXT         NOT NULL,
  "community_id" TEXT         NOT NULL,
  -- 'judge' (un lote de juicio) | 'redact' (título y resumen de una elegida, solo en enforce)
  "kind"         TEXT         NOT NULL,
  "articles"     SMALLINT     NOT NULL DEFAULT 0,
  -- null mientras la llamada está en curso o si el proceso cayó a la mitad
  "ok"           BOOLEAN,
  "error"        TEXT,
  "called_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brand_lane_calls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_lane_calls_kind_check" CHECK ("kind" IN ('judge', 'redact'))
);
-- El tope diario: llamadas por comunidad y día, contadas aquí.
CREATE INDEX IF NOT EXISTS "brand_lane_calls_community_called_idx"
  ON "brand_lane_calls" ("community_id", "called_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_brand_criteria_community_id_fkey') THEN
    ALTER TABLE "community_brand_criteria"
      ADD CONSTRAINT "community_brand_criteria_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_brands_feed_id_fkey') THEN
    ALTER TABLE "feed_brands"
      ADD CONSTRAINT "feed_brands_feed_id_fkey"
      FOREIGN KEY ("feed_id") REFERENCES "feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_brands_community_id_fkey') THEN
    ALTER TABLE "feed_brands"
      ADD CONSTRAINT "feed_brands_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_brand_assessments_story_id_fkey') THEN
    ALTER TABLE "story_brand_assessments"
      ADD CONSTRAINT "story_brand_assessments_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_brand_assessments_community_id_fkey') THEN
    ALTER TABLE "story_brand_assessments"
      ADD CONSTRAINT "story_brand_assessments_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_lane_calls_community_id_fkey') THEN
    ALTER TABLE "brand_lane_calls"
      ADD CONSTRAINT "brand_lane_calls_community_id_fkey"
      FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Semillas, todas apagadas. Parámetros aprobados el 12-oct-2026 (decisiones 2 y 5):
-- Araucanía: nota territorial ≥ 5, cupo 3 por día, al menos la mitad de región
-- completa, como máximo 1 del eje mapuche y chileno, no dos de la misma comuna.
-- Mapuche: rescate con nota de marca ≥ 7, hasta 2 por día; destacadas con
-- confrontación ≤ un tercio, al menos una de los cinco ejes y una del Puelmapu
-- cuando las haya, no más de 3 de un mismo feed.
INSERT INTO "community_brand_criteria" ("community_id", "criterion", "relevance_min", "daily_target", "balance")
SELECT c."id", 'territorial', 5, 3,
       '{"regionCompletaMin": 0.5, "mapucheChilenoMaxDia": 1, "seguridadMaxDia": 1, "porComunaMaxDia": 1}'::jsonb
  FROM "communities" c WHERE c."slug" = 'wallmapu-araucania'
ON CONFLICT ("community_id") DO NOTHING;

INSERT INTO "community_brand_criteria" ("community_id", "criterion", "relevance_min", "daily_target", "balance")
SELECT c."id", 'escala_mapuche', 7, 2,
       '{"confrontacionMaxDestacadas": 0.3334, "ejeDirectorMinDestacadas": 1, "puelmapuMinDestacadas": 1, "porFeedMaxDestacadas": 3}'::jsonb
  FROM "communities" c WHERE c."slug" = 'mapuche'
ON CONFLICT ("community_id") DO NOTHING;

-- Feeds de La Araucanía como fuente de candidatas (cargados el 4 y el 12-oct-2026).
INSERT INTO "feed_brands" ("feed_id", "community_id")
SELECT f."id", c."id"
  FROM "feeds" f CROSS JOIN "communities" c
 WHERE c."slug" = 'wallmapu-araucania'
   AND f."title" IN (
     'Araucanía Noticias', 'Tiempo21', 'Prensa Ciudadana', 'Diario El Informador (Nueva Imperial)',
     'Angol Noticias', 'Las Noticias de Malleco', 'La Voz de Pucón', 'Malleco Noticias',
     'Municipalidad de Temuco', 'Municipalidad de Victoria', 'Municipalidad de Villarrica',
     'Municipalidad de Lautaro', 'Municipalidad de Padre Las Casas',
     'Municipalidad de Angol · prensa municipal', 'Municipalidad de Collipulli', 'Municipalidad de Cunco',
     'Municipalidad de Curarrehue', 'Municipalidad de Freire', 'Municipalidad de Galvarino',
     'Municipalidad de Gorbea', 'Municipalidad de Loncoche', 'Municipalidad de Lonquimay',
     'Municipalidad de Lumaco · sala de prensa', 'Municipalidad de Melipeuco', 'Municipalidad de Perquenco',
     'Municipalidad de Pucón', 'Municipalidad de Renaico', 'Municipalidad de Teodoro Schmidt',
     'Municipalidad de Vilcún', 'Municipalidad de Nueva Imperial · sitemap',
     'Municipalidad de Los Sauces · sitemap', 'Municipalidad de Traiguén · sitemap',
     'Corparaucanía', 'Cámara de Comercio, Servicios y Turismo de La Araucanía',
     'SOFO (Sociedad de Fomento Agrícola de Temuco)', 'INDAP · Región de La Araucanía',
     'Servicio de Salud Araucanía Sur', 'Servicio de Salud Araucanía Norte',
     'Hospital Dr. Hernán Henríquez Aravena (Temuco)', 'Obispado de Temuco',
     'UFRO Medios (Radio Universidad de La Frontera)', 'Universidad de La Frontera · noticias',
     'Ministerio de las Culturas · búsqueda "Araucanía"', 'Ministerio del Medio Ambiente · búsqueda "Araucanía"',
     'Ministerio de Agricultura · búsqueda "Araucanía"', 'CONAF · búsqueda "Araucanía"'
   )
ON CONFLICT ("feed_id", "community_id") DO NOTHING;

-- El job del carril nace DESHABILITADO. Hace falta aquí y no basta seed-jobs.ts
-- porque el seed no corre en el despliegue. Encenderlo no basta para gastar: el
-- servicio no llama al modelo sin D5_ENABLED=true en Azure, sin una vertical en
-- 'shadow' o 'enforce' y sin pautas cargadas.
INSERT INTO "job_runs" ("id", "job_name", "cron_expression", "enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'brand_lane', '30 1,7,13,19 * * *', false, NOW(), NOW())
ON CONFLICT ("job_name") DO NOTHING;

-- Verificación DESPUÉS (esperado: 2 criterios, ambos en 'off'; 46 feeds marcados; el job deshabilitado).
SELECT c."slug", b."criterion", b."mode", b."rescue_mode", b."relevance_min", b."daily_target"
  FROM "community_brand_criteria" b JOIN "communities" c ON c."id" = b."community_id" ORDER BY 1;
SELECT count(*) AS feeds_marcados FROM "feed_brands";
SELECT "job_name", "cron_expression", "enabled" FROM "job_runs" WHERE "job_name" = 'brand_lane';
