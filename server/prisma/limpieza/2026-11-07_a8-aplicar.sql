-- A8 · Limpieza de datos, PASO 2: aplica. Una sola transacción con guardas.
--
-- Lo corre el director con psql, después del paso 1 (`2026-11-07_a8-comprobar.sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/limpieza/2026-11-07_a8-aplicar.sql
--
-- Si una guarda falla, la transacción entera se deshace y no cambia nada. Al
-- final imprime `marca_de_esta_limpieza`: guardarla, es lo que permite revertir
-- la parte 1 con exactitud (ver REVERSIÓN abajo).
--
-- Fuera de este archivo, a propósito:
--   - Las 2 filas de prueba del boletín del 11-sep: van por el panel,
--     Suscriptores → «Suprimir por correo», que borra base y Brevo y deja
--     registro de actividad. Las direcciones están en la memoria del proyecto.
--   - Las 3 reglas viejas del firewall: ya no existen. Medido el 7-nov con
--     `az postgres flexible-server firewall-rule list`: queda solo la de
--     servicios de Azure.
--   - Rehospedar las imágenes externas: es un script que escribe en la base
--     (`npm run migration:rehospedar-externas --prefix server`, simula; con
--     `:apply` escribe). Corre en la misma sesión con firewall abierto.

BEGIN;

SELECT now() AS marca_de_esta_limpieza;

-- ---------------------------------------------------------------------------
-- 1 · Las `fetched` de más de 14 días pasan a `rejected`.
--
-- Desde el 12-oct la cola del pre-análisis solo mira los últimos 14 días
-- (`PREASSESS_MAX_AGE_DAYS`), así que estas noticias no las va a evaluar nadie:
-- eran ~4.656 ese día, y el panel las sigue contando como cola pendiente.
-- Pasan a `rejected`, que es estado de archivo («retenidas indefinidamente», ver
-- .context/story-pipeline.md). NO se borran: el crawler salta toda URL que ya
-- está en la base (`services/crawler.ts:88`), y borrarlas haría que las vuelva
-- a bajar. Ninguna cifra pública cuenta las `rejected`: el sitio cuenta lo
-- publicado. Se distinguen de un rechazo real porque no tienen relevancia
-- (`relevance_pre` y `relevance` nulos).
-- ---------------------------------------------------------------------------

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM stories
   WHERE status = 'fetched' AND date_crawled < now() - interval '14 days';
  IF n > 10000 THEN
    RAISE EXCEPTION 'Hay % fetched de más de 14 días; el 12-oct eran ~4.656. Más de 10.000 no es lo esperado: no sigo.', n;
  END IF;
  RAISE NOTICE 'fetched de más de 14 días que pasan a rejected: %', n;
END $$;

UPDATE stories
   SET status = 'rejected', updated_at = now()
 WHERE status = 'fetched'
   AND date_crawled < now() - interval '14 days';

-- ---------------------------------------------------------------------------
-- 2 · DOCIP fuera: el feed se desactiva y la fila del job se borra.
--
-- docip.org responde 403 a todo lector automático desde agosto; el código del
-- job `scrape_docip` se borró el 12-oct por decisión del director (`8df4f6c`) y
-- quedaron pendientes por SQL la fila del job y el feed. El 7-nov el feed
-- «DOCIP Weekly News» todavía aparece como fuente activa en /api/sources.
-- El feed se DESACTIVA y no se borra: tiene noticias históricas que lo citan.
-- El iCal de Docip de la agenda es otra cosa y no se toca.
-- ---------------------------------------------------------------------------

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM feeds WHERE active AND (rss_url ILIKE '%docip%' OR title ILIKE '%docip%');
  IF n > 1 THEN
    RAISE EXCEPTION 'Hay % feeds activos de DOCIP; se esperaba 1. Revisar a mano: no sigo.', n;
  END IF;
  RAISE NOTICE 'feeds de DOCIP que se desactivan: %', n;
END $$;

UPDATE feeds
   SET active = false, updated_at = now()
 WHERE active AND (rss_url ILIKE '%docip%' OR title ILIKE '%docip%');

DELETE FROM job_runs WHERE job_name = 'scrape_docip';

-- ---------------------------------------------------------------------------
-- 3 · Nombres de fuentes sin espacios sobrantes.
--
-- 14 fuentes se publican con espacios al borde («Grist   », « Inside Climate
-- News»), medido en /api/sources el 7-nov. No se ve en la página, pero ensucia
-- el orden alfabético y cualquier comparación por nombre.
-- ---------------------------------------------------------------------------

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM feeds
   WHERE title <> btrim(title) OR (display_title IS NOT NULL AND display_title <> btrim(display_title));
  IF n > 40 THEN
    RAISE EXCEPTION 'Hay % fuentes con espacios; se esperaban ~14: no sigo.', n;
  END IF;
  RAISE NOTICE 'fuentes con espacios que se limpian: %', n;
END $$;

UPDATE feeds SET title = btrim(title), updated_at = now() WHERE title <> btrim(title);
UPDATE feeds SET display_title = btrim(display_title), updated_at = now()
 WHERE display_title IS NOT NULL AND display_title <> btrim(display_title);

-- ---------------------------------------------------------------------------
-- Después: lo que debería dar 0.
-- ---------------------------------------------------------------------------

SELECT 'fetched de más de 14 días (debe dar 0)' AS que, count(*) FROM stories
 WHERE status = 'fetched' AND date_crawled < now() - interval '14 days';
SELECT 'feeds DOCIP activos (debe dar 0)' AS que, count(*) FROM feeds
 WHERE active AND (rss_url ILIKE '%docip%' OR title ILIKE '%docip%');
SELECT 'fila scrape_docip (debe dar 0)' AS que, count(*) FROM job_runs WHERE job_name = 'scrape_docip';
SELECT 'fuentes con espacios (debe dar 0)' AS que, count(*) FROM feeds
 WHERE title <> btrim(title) OR (display_title IS NOT NULL AND display_title <> btrim(display_title));

COMMIT;

-- REVERSIÓN, si hiciera falta (reemplazar <marca> por la que imprimió arriba):
--   UPDATE stories SET status = 'fetched'
--    WHERE status = 'rejected' AND updated_at = '<marca>'
--      AND relevance_pre IS NULL AND relevance IS NULL;
--   UPDATE feeds SET active = true WHERE rss_url ILIKE '%docip%' OR title ILIKE '%docip%';
-- Los nombres de fuentes y la fila del job no se revierten: no hay nada que volver a poner.
