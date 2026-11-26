-- Medios locales: sin castigo y con bono (decisión del director, 26-nov-2026,
-- literal: «los medios locales no deben estar castigados, incluso deberían tener
-- un bono, porque los locales son los que mejor conocen a los indígenas»).
--
--   feeds.is_local   la fuente es un medio local o territorial. Se marca a mano
--                    en /admin/feeds. Sus noticias reciben +1 en la
--                    pre-evaluación y en la evaluación completa
--                    (server/src/lib/local-media-bonus.ts).
--
-- Es una COLUMNA de una tabla que ya existe (lección P2022 del 26-oct-2026):
-- ORDEN OBLIGATORIO — aplicar este SQL ANTES de desplegar el backend que lo
-- lee. Si el código nuevo llega primero, toda consulta a feeds sin `select`
-- falla con P2022.
--
-- Seguro de correr varias veces. La aplica el director (psql o pgAdmin); luego,
-- desde la raíz del repo:
--   npm run db:migrate:resolve --prefix server -- --applied 20261126000000_feeds_is_local

-- Verificación ANTES (esperado: 0 si es la primera vez).
SELECT count(*) AS columnas FROM information_schema.columns
 WHERE table_name = 'feeds' AND column_name = 'is_local';

ALTER TABLE "feeds" ADD COLUMN IF NOT EXISTS "is_local" BOOLEAN NOT NULL DEFAULT false;

-- La primera fuente marcada: Canal Paipote (Copiapó), la que originó la decisión.
UPDATE "feeds" SET "is_local" = true
 WHERE "rss_url" = 'https://www.canalpaipote.cl/feed/';

-- Verificación DESPUÉS (esperado: columnas = 1; locales = 1, Canal Paipote).
SELECT count(*) AS columnas FROM information_schema.columns
 WHERE table_name = 'feeds' AND column_name = 'is_local';
SELECT title, is_local FROM "feeds" WHERE "is_local" = true;
