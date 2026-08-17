-- Autor del artículo original.
--
-- POR QUÉ: el artículo 71 B de la Ley 17.336 es la única norma que ampara lo
-- que hace este medio. Permite incluir "fragmentos breves de obra protegida,
-- que haya sido lícitamente divulgada … a título de cita", pero **"siempre que
-- se mencione su fuente, título y autor"**. Verificado el 17-ago-2026 contra el
-- XML oficial de LeyChile (idNorma 28933).
--
-- Chile NO tiene una excepción separada para prensa o información de
-- actualidad —se buscaron "prensa", "actualidad", "noticias del día" en todo el
-- texto y no existen— así que esa cuarta condición no es decorativa: es la
-- única puerta.
--
-- Hasta hoy el autor no se capturaba en absoluto. Medido sobre los 25 dominios
-- más crawleados, 17 lo publican en meta tags o JSON-LD y 8 no. Por eso la
-- columna admite NULL: cuando el medio no lo publica, la ficha muestra fuente y
-- título, que es lo que hay. La ley obliga a mencionar al autor, no a
-- inventarlo.
--
-- No hay backfill automático: las historias ya crawleadas no conservan el HTML
-- de origen, así que su autor solo podría recuperarse volviendo a descargar
-- cada página. Se aplica de aquí en adelante.
--
-- Seguro de correr varias veces (IF NOT EXISTS).

ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "source_author" TEXT;

COMMIT;

-- Verificación — debe devolver 1:
--   SELECT count(*) FROM information_schema.columns
--     WHERE table_name = 'stories' AND column_name = 'source_author';
