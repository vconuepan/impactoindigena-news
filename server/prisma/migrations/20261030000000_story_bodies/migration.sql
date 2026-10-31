-- La nota con claves (plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`,
-- ítems B1-B4, decisión del director del 25-oct-2026: «enriquecemos la ficha»).
--
-- Hasta hoy la ficha pública mostraba un resumen de 40-70 palabras redactado
-- con los primeros 4.000 caracteres del artículo, y debajo las viñetas del
-- puntaje. Esta tabla guarda el cuerpo que la reemplaza: cuatro claves
-- (qué pasó · por qué importa a los pueblos · contexto · qué sigue) más una
-- bajada, redactadas desde el artículo completo al publicar y filtradas por
-- los candados de lib/storyBodyGuards.ts. Si un candado bloquea, no hay fila
-- y la ficha sale como siempre.
--
--   story_bodies   una fila por noticia (story_id único): las cinco partes en
--                  español, sus traducciones (NULL hasta que el traductor las
--                  escriba), el método (`ia_sin_revision` al nacer; `ia_revisada`
--                  cuando alguien la lee y la aprueba en el panel; `humana` si la
--                  escribió una persona), quién la revisó, y el despliegue y los
--                  tokens que costó, para medir sin estimar.
--
-- Tabla nueva y no columnas de stories, por la lección del 26-oct-2026 con
-- editorials: una columna nueva en un modelo existente rompe findMany() con
-- P2022 si el código llega antes que el SQL. Solo el código nuevo consulta
-- esta tabla y tolera que no exista: la ficha cae al resumen de siempre y el
-- job de publicación deja un aviso en el log por noticia.
--
-- ORDEN: puede aplicarse antes o después del despliegue. Hasta que se aplique
-- no se redacta ningún cuerpo.
--
-- ids TEXT (como stories). TEXT + CHECK en vez de enum. Seguro de correr varias
-- veces (IF NOT EXISTS). La aplica el director con psql; luego, desde server/:
--   npm run db:migrate:resolve --prefix server -- --applied 20261030000000_story_bodies

-- Verificación ANTES (esperado: 0 si es la primera vez).
SELECT count(*) AS story_bodies FROM information_schema.tables WHERE table_name = 'story_bodies';

CREATE TABLE IF NOT EXISTS "story_bodies" (
  "id"                  TEXT NOT NULL,
  "story_id"            TEXT NOT NULL,
  "bajada"              TEXT NOT NULL,
  "que_paso"            TEXT NOT NULL,
  "por_que_importa"     TEXT NOT NULL,
  "contexto"            TEXT NOT NULL,
  "que_sigue"           TEXT NOT NULL DEFAULT '',
  "bajada_en"           TEXT,
  "que_paso_en"         TEXT,
  "por_que_importa_en"  TEXT,
  "contexto_en"         TEXT,
  "que_sigue_en"        TEXT,
  "method"              TEXT NOT NULL DEFAULT 'ia_sin_revision',
  "reviewed_by"         TEXT NOT NULL DEFAULT '',
  "model"               TEXT NOT NULL DEFAULT '',
  "input_tokens"        INTEGER NOT NULL DEFAULT 0,
  "output_tokens"       INTEGER NOT NULL DEFAULT 0,
  "source_chars"        INTEGER NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_bodies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_bodies_story_id_key" ON "story_bodies"("story_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_bodies_story_id_fkey') THEN
    ALTER TABLE "story_bodies" ADD CONSTRAINT "story_bodies_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_bodies_method_check') THEN
    ALTER TABLE "story_bodies" ADD CONSTRAINT "story_bodies_method_check"
      CHECK ("method" IN ('ia_sin_revision', 'ia_revisada', 'humana'));
  END IF;
END $$;

-- Verificación DESPUÉS (esperado: 1 tabla, 20 columnas, el índice único, la FK y el CHECK).
SELECT count(*) AS story_bodies FROM information_schema.tables WHERE table_name = 'story_bodies';
SELECT count(*) AS columnas FROM information_schema.columns WHERE table_name = 'story_bodies';
SELECT indexname FROM pg_indexes WHERE tablename = 'story_bodies';
SELECT conname FROM pg_constraint WHERE conname IN ('story_bodies_story_id_fkey', 'story_bodies_method_check') ORDER BY 1;
