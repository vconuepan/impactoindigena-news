-- Analítica: contar aparte a los robots y marcar la interacción humana
-- (pasos 2 y 3 de docs/propuesta-analytics-bots.md, aprobados el 20-nov-2026).
--
-- Dos tablas NUEVAS. Ninguna columna en tablas existentes: si el código llega
-- antes que este SQL, una columna nueva rompe findMany() con P2022; una tabla
-- nueva no rompe nada (.context/database-migrations.md). El código tolera que
-- no existan: el conteo falla en silencio y el panel muestra «sin datos».
--
--   ua_hits_daily        cuántas peticiones hizo cada FAMILIA de User-Agent
--                        por día y superficie: 'beacon' (los /api/track de
--                        robots, que antes se descartaban sin contarse) y
--                        'ficha_html' (toda carga de /stories/*, ejecute
--                        JavaScript o no). Agregado puro: sin IP, sin
--                        User-Agent completo, sin nada por visitante. No se poda,
--                        como page_views.
--
--   visitor_day_signals  una fila por visitante y día con `interacted`: si hubo
--                        scroll, toque, tecla o mouse con 5 s visibles. Lleva el
--                        mismo hash diario no reversible de daily_visitors para
--                        cruzarse con su país y dispositivo, y se borra con su
--                        mismo plazo (jobs/cleanupAnalytics.ts, 12 meses).
--
-- ORDEN: puede aplicarse antes o después del despliegue. Seguro de correr varias
-- veces (IF NOT EXISTS). ids TEXT, como page_views y daily_visitors.
-- La aplica el director con psql; luego, desde server/:
--   npm run db:migrate:resolve --prefix server -- --applied 20261120000000_analytics_robots_interaccion

-- Verificación ANTES (esperado: 0 tablas si es la primera vez).
SELECT count(*) AS tablas_antes FROM information_schema.tables
 WHERE table_name IN ('ua_hits_daily', 'visitor_day_signals');

CREATE TABLE IF NOT EXISTS "ua_hits_daily" (
  "id"      TEXT NOT NULL,
  "date"    TIMESTAMP(3) NOT NULL,
  "surface" VARCHAR(16) NOT NULL,
  "family"  VARCHAR(24) NOT NULL,
  "agent"   VARCHAR(64) NOT NULL DEFAULT '',
  "count"   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ua_hits_daily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ua_hits_daily_surface_check" CHECK ("surface" IN ('beacon', 'ficha_html'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ua_hits_daily_date_surface_family_agent_key"
  ON "ua_hits_daily" ("date", "surface", "family", "agent");
CREATE INDEX IF NOT EXISTS "ua_hits_daily_date_idx" ON "ua_hits_daily" ("date");

CREATE TABLE IF NOT EXISTS "visitor_day_signals" (
  "id"           TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "visitor_hash" VARCHAR(64) NOT NULL,
  "interacted"   BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "visitor_day_signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "visitor_day_signals_date_visitor_hash_key"
  ON "visitor_day_signals" ("date", "visitor_hash");
CREATE INDEX IF NOT EXISTS "visitor_day_signals_date_idx" ON "visitor_day_signals" ("date");

-- Verificación DESPUÉS (esperado: 2 tablas; 6 y 4 columnas; 3 índices cada una).
SELECT count(*) AS tablas_despues FROM information_schema.tables
 WHERE table_name IN ('ua_hits_daily', 'visitor_day_signals');
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE table_name IN ('ua_hits_daily', 'visitor_day_signals') ORDER BY table_name, ordinal_position;
SELECT tablename, indexname FROM pg_indexes
 WHERE tablename IN ('ua_hits_daily', 'visitor_day_signals') ORDER BY tablename, indexname;
