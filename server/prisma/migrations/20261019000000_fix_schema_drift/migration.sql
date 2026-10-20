-- Deriva entre producción y schema.prisma, corregida en la base (18-oct-2026).
--
-- `prisma migrate diff` de producción contra el modelo pedía 22 cambios. 21 venían de
-- migration.sql escritos a mano que no calzaban con el modelo; uno, de un cambio a mano
-- en la base (ver UserType abajo). Se clasificaron así:
--   · 13 los corrige el modelo, en este mismo commit (schema.prisma describe lo que la
--     base ya tiene: timestamptz, DEFAULT, nombres de índice, el uuid de magic_links).
--   · 3 no se tocan:
--       - las tablas de D5: eran un artefacto de comparar contra un main atrasado;
--       - stories_embedding_idx, el índice HNSW de la búsqueda, que Prisma 6 no sabe
--         modelar;
--       - UserType: producción tiene COMUNIDAD_LIDER, que alguien agregó a mano (ninguna
--         migración lo crea) y que usan las cuentas, y conserva sin uso el valor
--         COMUNIDAD que creó 20260503000002_fix_users_schema. El diff pide recrear el
--         enum para quitar ese valor sobrante. No rompe nada y no se toca aquí.
--     Esos dos bloques (el índice y el enum) son lo único que debe quedar en el diff;
--     nunca aplicarlos.
--   · 6 se corrigen aquí, en la base:
--   Parte A · arregla algo que fallaba
--     A2  page_views: se borra el índice único viejo (path, date). El DROP CONSTRAINT de
--         20260519000000_add_pageview_source no lo borró (es un índice, no una
--         restricción), y desde el 19-may la visita de un segundo origen a la misma página
--         el mismo día chocaba con él y se perdía en silencio (track.ts traga el error).
--   Parte B · la base era más laxa que el modelo; se ajusta solo si los datos lo permiten
--     B1  alert_subscriptions.token NOT NULL        (solo si ninguna fila lo tiene nulo)
--     B2  users."passwordHash" NOT NULL             (solo si ninguna fila lo tiene nulo)
--     B3  newsletter_sends.stats DEFAULT '{}' y NOT NULL (lo segundo, solo si no hay nulos)
--     B4  índice único pending_subscriptions_token_key (solo si no hay tokens repetidos)
--     B5  DROP TYPE "UserRole", enum de la migración inicial que ya no usa ninguna columna
--
-- No toca datos. Seguro de correr dos veces: cada paso mira el catálogo y se salta si ya
-- está hecho. Todo va en UNA transacción. Un paso de la parte B que se salta por datos
-- lo avisa con un NOTICE y el resto sigue.
--
-- Probado el 25-oct en una réplica local con todas las migraciones anteriores y el
-- COMUNIDAD_LIDER agregado como en producción: con este SQL y el modelo de este commit,
-- el diff queda en los dos bloques de arriba (DROP INDEX "stories_embedding_idx" y la
-- recreación de UserType). Los datos que deciden cada guarda se leyeron en producción,
-- en solo lectura, el 25-oct: cero nulos, cero tokens repetidos, UserRole sin uso y el
-- índice viejo de page_views presente y único. Informe: otras-voces (repo privado),
-- estrategia/datos/deriva-esquema-2026-10-18/.
--
-- La aplica el director con psql; luego:
--   npm run db:migrate:resolve --prefix server -- --applied 20261019000000_fix_schema_drift

-- =====================================================================
-- Verificación ANTES. Leído en producción el 25-oct: UserType con COMUNIDAD y
-- COMUNIDAD_LIDER (cuentas solo en el segundo), page_views_path_date_key presente y
-- único, 0 días-página con más de un origen desde el 19-may, y los conteos en 0.
-- =====================================================================
SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) AS usertype_antes
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'UserType' AND t.typnamespace = 'public'::regnamespace;
SELECT "userType"::text AS tipo, count(*) AS usuarios FROM "users" GROUP BY 1 ORDER BY 1;
SELECT indexrelid::regclass AS indice, indisunique AS unico
  FROM pg_index WHERE indrelid = 'public.page_views'::regclass ORDER BY 1;
-- Esperado 0 si el índice viejo estuvo activo: ninguna página tiene dos orígenes el mismo día.
SELECT count(*) AS dias_pagina_con_mas_de_un_origen
  FROM (SELECT 1 FROM "page_views" WHERE "date" >= '2026-05-19'
         GROUP BY "path", "date" HAVING count(DISTINCT "source") > 1) g;
SELECT
  (SELECT count(*) FROM "alert_subscriptions" WHERE "token" IS NULL)        AS alertas_sin_token,
  (SELECT count(*) FROM "users" WHERE "passwordHash" IS NULL)               AS usuarios_sin_hash,
  (SELECT count(*) FROM "newsletter_sends" WHERE "stats" IS NULL)           AS envios_sin_stats,
  (SELECT count(*) FROM (SELECT "token" FROM "pending_subscriptions"
                          GROUP BY "token" HAVING count(*) > 1) d)          AS tokens_repetidos;

BEGIN;
-- Si otra sesión tiene tomada una tabla, mejor fallar en 5 s que hacer esperar al sitio.
SET LOCAL lock_timeout = '5s';

-- A2 · page_views: borrar el índice (path, date) SOLO si existe el que lo reemplaza
--      (path, date, source), para que la tabla nunca quede sin unicidad.
DO $$
BEGIN
  IF to_regclass('public.page_views_path_date_key') IS NULL THEN
    RAISE NOTICE 'A2 ya estaba: page_views_path_date_key no existe';
  ELSIF EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'page_views_path_date_source_key'
                   AND conrelid = 'public.page_views'::regclass AND contype = 'u') THEN
    DROP INDEX "public"."page_views_path_date_key";
    RAISE NOTICE 'A2 hecho: borrado page_views_path_date_key';
  ELSE
    RAISE NOTICE 'A2 NO hecho: falta page_views_path_date_source_key; no se toca nada';
  END IF;
END $$;

-- B1 · alert_subscriptions.token NOT NULL, si ningún registro lo tiene nulo.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "alert_subscriptions" WHERE "token" IS NULL;
  IF (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.alert_subscriptions'::regclass AND attname = 'token') THEN
    RAISE NOTICE 'B1 ya estaba: alert_subscriptions.token es NOT NULL';
  ELSIF n = 0 THEN
    ALTER TABLE "public"."alert_subscriptions" ALTER COLUMN "token" SET NOT NULL;
    RAISE NOTICE 'B1 hecho: alert_subscriptions.token NOT NULL';
  ELSE
    RAISE NOTICE 'B1 NO hecho: % suscripciones sin token', n;
  END IF;
END $$;

-- B2 · users."passwordHash" NOT NULL, si ningún usuario lo tiene nulo.
--      (Quien entra por enlace mágico queda con '' y no con NULL: auth-public.ts.)
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "users" WHERE "passwordHash" IS NULL;
  IF (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'passwordHash') THEN
    RAISE NOTICE 'B2 ya estaba: users.passwordHash es NOT NULL';
  ELSIF n = 0 THEN
    ALTER TABLE "public"."users" ALTER COLUMN "passwordHash" SET NOT NULL;
    RAISE NOTICE 'B2 hecho: users.passwordHash NOT NULL';
  ELSE
    RAISE NOTICE 'B2 NO hecho: % usuarios sin passwordHash', n;
  END IF;
END $$;

-- B3 · newsletter_sends.stats: DEFAULT '{}' siempre; NOT NULL solo si no hay nulos.
ALTER TABLE "public"."newsletter_sends" ALTER COLUMN "stats" SET DEFAULT '{}';
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "newsletter_sends" WHERE "stats" IS NULL;
  IF (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.newsletter_sends'::regclass AND attname = 'stats') THEN
    RAISE NOTICE 'B3 ya estaba: newsletter_sends.stats es NOT NULL';
  ELSIF n = 0 THEN
    ALTER TABLE "public"."newsletter_sends" ALTER COLUMN "stats" SET NOT NULL;
    RAISE NOTICE 'B3 hecho: newsletter_sends.stats NOT NULL';
  ELSE
    RAISE NOTICE 'B3 a medias: DEFAULT puesto; % envíos con stats nulo, NOT NULL no se pone', n;
  END IF;
END $$;

-- B4 · token único en pending_subscriptions, si no hay tokens repetidos.
--      El índice no único pending_subscriptions_token_idx se queda: el modelo lo declara.
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.pending_subscriptions_token_key') IS NOT NULL THEN
    RAISE NOTICE 'B4 ya estaba: pending_subscriptions_token_key existe';
  ELSE
    SELECT count(*) INTO n FROM (SELECT "token" FROM "pending_subscriptions"
                                  GROUP BY "token" HAVING count(*) > 1) d;
    IF n = 0 THEN
      CREATE UNIQUE INDEX "pending_subscriptions_token_key" ON "public"."pending_subscriptions" ("token");
      RAISE NOTICE 'B4 hecho: creado pending_subscriptions_token_key';
    ELSE
      RAISE NOTICE 'B4 NO hecho: % tokens repetidos', n;
    END IF;
  END IF;
END $$;

-- B5 · DROP TYPE "UserRole" (de la migración inicial; la tabla que lo usaba se recreó el
--      5-may con UserType). RESTRICT: si algo todavía lo usara, no se borra y se avisa.
DO $$
BEGIN
  IF to_regtype('public."UserRole"') IS NULL THEN
    RAISE NOTICE 'B5 ya estaba: UserRole no existe';
  ELSE
    BEGIN
      DROP TYPE "public"."UserRole" RESTRICT;
      RAISE NOTICE 'B5 hecho: borrado el tipo UserRole';
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'B5 NO hecho: algo todavía usa UserRole';
    END;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Verificación DESPUÉS. Esperado: UserType igual que antes (no se toca),
-- sin page_views_path_date_key, las tres columnas en NOT NULL, el índice
-- único de pending_subscriptions y UserRole ausente.
-- =====================================================================
SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) AS usertype_despues
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'UserType' AND t.typnamespace = 'public'::regnamespace;
SELECT indexrelid::regclass AS indice, indisunique AS unico
  FROM pg_index WHERE indrelid = 'public.page_views'::regclass ORDER BY 1;
SELECT c.relname AS tabla, a.attname AS columna, a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS def
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE c.relnamespace = 'public'::regnamespace
   AND (c.relname, a.attname) IN (('alert_subscriptions', 'token'), ('users', 'passwordHash'), ('newsletter_sends', 'stats'))
 ORDER BY 1;
SELECT to_regclass('public.pending_subscriptions_token_key') AS indice_token_unico,
       to_regtype('public."UserRole"') AS userrole;
