-- A8 · Limpieza de datos, PASO 1: solo cuenta, no cambia nada.
--
-- Lo corre el director con psql, antes del paso 2 (`2026-11-07_a8-aplicar.sql`),
-- para ver lo que el paso 2 va a tocar. El agente no puede leer la base de
-- producción (bloqueo del clasificador y firewall), así que estos números son
-- la única medición previa.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/limpieza/2026-11-07_a8-comprobar.sql
--
-- Lo esperado según lo medido antes (ver cada comentario del paso 2):
--   fetched de más de 14 días ........ ~4.656 el 12-oct (puede haber más)
--   feed DOCIP activo ................. 1  (aparece en /api/sources el 7-nov)
--   fila del job scrape_docip ......... 0 o 1
--   feeds con espacios en el nombre ... 14 (medido en /api/sources el 7-nov)

SELECT 'fetched de más de 14 días' AS que, count(*) AS cuantas
  FROM stories
 WHERE status = 'fetched' AND date_crawled < now() - interval '14 days';

SELECT 'fetched de más de 14 días, por mes de rastreo' AS que,
       to_char(date_trunc('month', date_crawled), 'YYYY-MM') AS mes, count(*) AS cuantas
  FROM stories
 WHERE status = 'fetched' AND date_crawled < now() - interval '14 days'
 GROUP BY 2 ORDER BY 2;

SELECT 'feed DOCIP' AS que, id, title, rss_url, active,
       (SELECT count(*) FROM stories s WHERE s.feed_id = f.id) AS noticias
  FROM feeds f
 WHERE f.rss_url ILIKE '%docip%' OR f.title ILIKE '%docip%';

SELECT 'job scrape_docip' AS que, job_name, enabled, last_completed_at, left(last_error, 80) AS ultimo_error
  FROM job_runs
 WHERE job_name = 'scrape_docip';

SELECT 'feed con espacios en el nombre' AS que, id,
       '[' || title || ']' AS title, '[' || coalesce(display_title, '') || ']' AS display_title
  FROM feeds
 WHERE title <> btrim(title) OR (display_title IS NOT NULL AND display_title <> btrim(display_title));
