-- Señales del visitante-día para el puntaje «lector probable»
-- (pasos 4 y 5 de docs/propuesta-analytics-bots.md, 21-nov-2026).
--
-- Siete columnas nuevas en `visitor_day_signals`, la tabla que creó la migración
-- del 20-nov. Es seguro agregar columnas aquí: esa tabla solo la leen y escriben
-- consultas SQL crudas del código nuevo, nunca un findMany() de Prisma, así que
-- no hay riesgo de P2022 (.context/database-migrations.md).
--
--   pages         cuántas vistas tuvo el visitante en el día
--   saw_story     si vio al menos una noticia
--   saw_search    si vio la búsqueda
--   saw_other     si vio otra página (portada, secciones…)
--   source_first  origen de su PRIMERA vista del día ('', search, social…)
--   lang          'coherente' | 'incoherente' | 'sin_dato'. NUNCA el código de la
--                 lengua: un navegador en quechua o mapudungun revela origen
--                 étnico, que es dato sensible (lib/senalesVisitante.ts).
--   net           el proveedor de nube si la IP es de una (p. ej. 'Alibaba Cloud');
--                 '' si no. La IP no se guarda.
--
-- Nada identifica a una persona: van junto al mismo hash diario no reversible y
-- se borran con él a los 12 meses (jobs/cleanupAnalytics.ts).
--
-- ORDEN: conviene aplicarlo ANTES del despliegue. Si el código llega primero,
-- no se rompe nada (la escritura de señales falla en silencio y el panel dice
-- «sin datos»), pero esas horas quedan sin señales.
-- Seguro de correr varias veces (IF NOT EXISTS). Luego, desde server/:
--   npm run db:migrate:resolve --prefix server -- --applied 20261121000000_visitor_day_signals_puntaje

-- Verificación ANTES (esperado: 4 columnas si es la primera vez).
SELECT count(*) AS columnas_antes FROM information_schema.columns WHERE table_name = 'visitor_day_signals';

ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "pages"        INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "saw_story"    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "saw_search"   BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "saw_other"    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "source_first" VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "lang"         VARCHAR(12) NOT NULL DEFAULT 'sin_dato';
ALTER TABLE "visitor_day_signals" ADD COLUMN IF NOT EXISTS "net"          VARCHAR(40) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitor_day_signals_lang_check') THEN
    ALTER TABLE "visitor_day_signals" ADD CONSTRAINT "visitor_day_signals_lang_check"
      CHECK ("lang" IN ('coherente', 'incoherente', 'sin_dato'));
  END IF;
END $$;

-- Verificación DESPUÉS (esperado: 11 columnas y la restricción de lang).
SELECT count(*) AS columnas_despues FROM information_schema.columns WHERE table_name = 'visitor_day_signals';
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'visitor_day_signals' ORDER BY ordinal_position;
SELECT conname FROM pg_constraint WHERE conname = 'visitor_day_signals_lang_check';
-- Cuántas filas tiene hoy (de la migración del 20-nov), solo para referencia.
SELECT count(*) AS filas, count(*) FILTER (WHERE interacted) AS con_interaccion FROM visitor_day_signals;
