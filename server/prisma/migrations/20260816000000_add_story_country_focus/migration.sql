-- Eje geográfico de las historias, separado del tema.
--
-- POR QUÉ: hasta hoy el país era una categoría más. "Chile Intercultural"
-- competía con Derechos Indígenas, Cambio Climático y Economías Indígenas por
-- la misma ranura (`issue_id`, que es una sola), así que una noticia chilena
-- sobre derechos territoriales caía en Chile y desaparecía de Derechos.
--
-- Medido el 15-ago-2026 sobre las 2000 historias publicadas: 94 con marcador
-- chileno en el titular estaban repartidas en las otras tres secciones y
-- ausentes de la suya. El corte geográfico no capturaba ni un tercio de lo
-- chileno que publica el sitio.
--
-- Desde esta migración el tema y el país son dos ejes: `issue_id` guarda el
-- asunto, `country_focus` guarda el país. Una historia puede estar en su tema
-- Y en su sección de país al mismo tiempo, que era el objetivo.
--
-- FORMATO: ISO 3166-1 alfa-2 en mayúsculas ("CL"), o NULL cuando el artículo
-- no trata de un país en particular. Se eligió texto libre con normalización
-- determinista en el código, y no un enum de Postgres, para que sumar un país
-- nuevo sea una constante y no un ALTER TYPE.
--
-- NO reclasifica nada. Las historias existentes quedan con country_focus NULL
-- y su issue actual intacto; la sección de Chile las sigue mostrando por
-- `issue_id` mientras tanto. El backfill es un paso aparte y con su propia
-- decisión: `npm run migration:backfill-country --prefix server`.
--
-- Seguro de correr varias veces (IF NOT EXISTS).

ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "country_focus" TEXT;

CREATE INDEX IF NOT EXISTS "stories_country_focus_idx" ON "stories"("country_focus");

COMMIT;

-- Verificación — debe devolver una fila con la columna y el índice:
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name = 'stories' AND column_name = 'country_focus') AS columna,
--     (SELECT count(*) FROM pg_indexes
--       WHERE tablename = 'stories' AND indexname = 'stories_country_focus_idx') AS indice;
