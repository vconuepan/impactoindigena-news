-- La editorial firmada (plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`,
-- ítems B5 y B6, decisión del director del 25-oct-2026: «abrimos la capa de
-- contenido propio firmado»).
--
-- Cuatro columnas nuevas en `editorials`:
--   notes        las notas del director, la única fuente del borrador. PRIVADAS:
--                la API pública no las devuelve.
--   author_name  la firma. Sin firma no se publica (indicador 2 del Trust Project).
--   method       cómo se hizo: 'humana' (la escribió el autor, la IA ordenó) o
--                'ia_revisada' (la IA redactó desde las notas y el autor la revisó
--                y editó). '' mientras no se fije. TEXT + CHECK, no enum.
--   sources      fuentes consultadas, texto libre.
--
-- ORDEN: este SQL va ANTES del despliegue del código que lee las columnas. Si el
-- código llega primero, `findMany()` sobre editorials falla con P2022 y la
-- página /voces-indigenas devuelve 500 hasta que se aplique. El código tolera
-- la ausencia con un `select` de respaldo, pero no hay que contar con eso.
--
-- Seguro de correr varias veces (IF NOT EXISTS). La aplica el director con
-- psql; luego, desde server/:
--   npm run db:migrate:resolve --prefix server -- --applied 20261026000000_editorial_firma_metodo

-- Verificación ANTES (esperado: 4 filas vacías → las columnas no existen).
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'editorials' AND column_name IN ('notes', 'author_name', 'method', 'sources');

ALTER TABLE "editorials" ADD COLUMN IF NOT EXISTS "notes"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "editorials" ADD COLUMN IF NOT EXISTS "author_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "editorials" ADD COLUMN IF NOT EXISTS "method"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "editorials" ADD COLUMN IF NOT EXISTS "sources"     TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorials_method_check') THEN
    ALTER TABLE "editorials"
      ADD CONSTRAINT "editorials_method_check" CHECK ("method" IN ('', 'humana', 'ia_revisada'));
  END IF;
END $$;

-- Verificación DESPUÉS (esperado: las 4 columnas, y la restricción).
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'editorials' AND column_name IN ('notes', 'author_name', 'method', 'sources')
 ORDER BY column_name;
SELECT conname FROM pg_constraint WHERE conname = 'editorials_method_check';
