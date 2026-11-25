-- Regla 2 de la independencia editorial (director, 25-nov-2026, «sigue tu
-- recomendcion»; fuente: impactoindigena/docs/DEFINICION_TRES_VERTICALES_Y_CASA_2026-11-25.md
-- §2 bis): el medio avisa cuando una nota informa sobre un cliente de
-- impactoindigena.ai o de impactoindigena.legal. Decisión del mismo día: el aviso
-- es GENÉRICO, nunca nombra a la organización.
--
--   disclosure_clients            la lista: una fila por organización y vertical.
--                                 Solo organizaciones (empresas, comunidades,
--                                 asociaciones, órganos del Estado), nunca
--                                 personas; ningún campo dice origen étnico.
--   story_disclosure_dismissals   falsos positivos: este cliente NO es de lo que
--                                 informa esta nota (un homónimo, una mención al
--                                 pasar). Borrar la fila devuelve el aviso.
--
-- El cruce se hace al leer la ficha (server/src/lib/avisoClientes.ts), no al
-- publicar: por eso no hay tabla de avisos y las notas ya publicadas quedan
-- cubiertas en cuanto se carga un cliente.
--
-- Tablas nuevas y no columnas de stories (lección P2022 del 26-oct-2026): solo el
-- código nuevo las lee y tolera que no existan. ORDEN: puede aplicarse antes o
-- después del despliegue; hasta que se aplique, ninguna ficha lleva aviso.
--
-- ids TEXT (como stories). TEXT + CHECK en vez de enum. Seguro de correr varias
-- veces. La aplica el director en pgAdmin; luego, desde la raíz del repo:
--   npm run db:migrate:resolve --prefix server -- --applied 20261125000000_aviso_clientes

-- Verificación ANTES (esperado: 0 si es la primera vez).
SELECT count(*) AS tablas FROM information_schema.tables
 WHERE table_name IN ('disclosure_clients', 'story_disclosure_dismissals');

CREATE TABLE IF NOT EXISTS "disclosure_clients" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "aliases"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "vertical"    TEXT NOT NULL,
  "rut"         TEXT,
  "ended_on"    DATE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disclosure_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "story_disclosure_dismissals" (
  "id"            TEXT NOT NULL,
  "story_id"      TEXT NOT NULL,
  "client_id"     TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "dismissed_by"  TEXT NOT NULL DEFAULT '',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_disclosure_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_disclosure_dismissals_story_id_client_id_key"
  ON "story_disclosure_dismissals"("story_id", "client_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disclosure_clients_vertical_check') THEN
    ALTER TABLE "disclosure_clients" ADD CONSTRAINT "disclosure_clients_vertical_check"
      CHECK ("vertical" IN ('ai', 'legal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_disclosure_dismissals_story_id_fkey') THEN
    ALTER TABLE "story_disclosure_dismissals" ADD CONSTRAINT "story_disclosure_dismissals_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_disclosure_dismissals_client_id_fkey') THEN
    ALTER TABLE "story_disclosure_dismissals" ADD CONSTRAINT "story_disclosure_dismissals_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "disclosure_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Verificación DESPUÉS (esperado: 2 tablas, 8 y 6 columnas, el índice único y 3 restricciones).
SELECT count(*) AS tablas FROM information_schema.tables
 WHERE table_name IN ('disclosure_clients', 'story_disclosure_dismissals');
SELECT table_name, count(*) AS columnas FROM information_schema.columns
 WHERE table_name IN ('disclosure_clients', 'story_disclosure_dismissals') GROUP BY 1 ORDER BY 1;
SELECT indexname FROM pg_indexes WHERE tablename = 'story_disclosure_dismissals';
SELECT conname FROM pg_constraint
 WHERE conname IN ('disclosure_clients_vertical_check',
                   'story_disclosure_dismissals_story_id_fkey',
                   'story_disclosure_dismissals_client_id_fkey') ORDER BY 1;
