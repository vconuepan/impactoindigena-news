-- CreateEnum
CREATE TYPE "AgendaItemType" AS ENUM ('evento', 'convocatoria', 'oportunidad', 'publicacion');

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" TEXT NOT NULL,
    "type" "AgendaItemType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "title_original" TEXT,
    "summary" TEXT,
    "due_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'es',
    "doc_ref" TEXT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlight_new" BOOLEAN NOT NULL DEFAULT false,
    "extended_deadline" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "extraction_score" DOUBLE PRECISION,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agenda_items_external_id_key" ON "agenda_items"("external_id");

-- CreateIndex
CREATE INDEX "agenda_items_status_type_idx" ON "agenda_items"("status", "type");

-- CreateIndex
CREATE INDEX "agenda_items_status_due_date_idx" ON "agenda_items"("status", "due_date");

-- CreateIndex
CREATE INDEX "agenda_items_status_start_date_idx" ON "agenda_items"("status", "start_date");
