-- Las fotos del cuerpo del artículo original (pedido del director, 29-oct-2026:
-- más fotos reales en el carrusel, con crédito al medio).
--
-- Cada noticia guardaba UNA imagen (stories.image_url, la og:image). Esta tabla
-- guarda las demás `<img>` del cuerpo, capturadas al extraer
-- (lib/fotosDelArticulo.ts), y la copia rehospedada en R2 que se sube al
-- publicar (`ogfoto-<story_id>-NN`, jobs/publishStories.ts). El carrusel de
-- Instagram, LinkedIn y el panel dibuja solo las que tienen hosted_url.
--
--   story_images   una fila por foto: su orden en el artículo (position, desde
--                  1), la dirección original (source_url) y la copia en R2
--                  (hosted_url; NULL mientras no se publique la noticia o si la
--                  foto no se pudo bajar o era demasiado chica).
--
-- Tabla nueva y no columna de stories, por la misma razón que
-- 20261013000000_add_brand_lane: una columna nueva en un modelo existente
-- rompe findMany() con P2022 si el código llega antes que este SQL (pasó el
-- 26-oct con editorials). Solo el código nuevo consulta esta tabla, y tolera
-- que no exista: el rastreo guarda las fotos en un paso aparte que no detiene
-- la creación de la noticia, y el carrusel sale sin fotos de desarrollo.
--
-- ORDEN: puede aplicarse antes o después del despliegue. Hasta que se aplique,
-- las noticias nuevas se crean sin fotos del cuerpo (un aviso en el log por
-- noticia) y el carrusel sigue como el 29-oct: foto del medio solo en la
-- portada y el cierre.
--
-- ids TEXT (como stories). Seguro de correr varias veces (IF NOT EXISTS).
-- La aplica el director con psql; luego, desde server/:
--   npm run db:migrate:resolve --prefix server -- --applied 20261029000000_story_images

-- Verificación ANTES (esperado: 0 si es la primera vez).
SELECT count(*) AS story_images FROM information_schema.tables WHERE table_name = 'story_images';

CREATE TABLE IF NOT EXISTS "story_images" (
  "id"         TEXT NOT NULL,
  "story_id"   TEXT NOT NULL,
  "position"   INTEGER NOT NULL,
  "source_url" TEXT NOT NULL,
  "hosted_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_images_story_id_position_key"
  ON "story_images"("story_id", "position");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_images_story_id_fkey') THEN
    ALTER TABLE "story_images" ADD CONSTRAINT "story_images_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Verificación DESPUÉS (esperado: 1 tabla, 6 columnas, el índice único y la FK).
SELECT count(*) AS story_images FROM information_schema.tables WHERE table_name = 'story_images';
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'story_images' ORDER BY ordinal_position;
SELECT indexname FROM pg_indexes WHERE tablename = 'story_images';
SELECT conname FROM pg_constraint WHERE conname = 'story_images_story_id_fkey';
