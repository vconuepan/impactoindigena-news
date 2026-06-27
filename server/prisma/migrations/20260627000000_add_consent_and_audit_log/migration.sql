-- Ley 21.719: consentimiento expreso para dato sensible (origen étnico) en
-- comunidades de tipo PUEBLO + registro de actividad (audit_log).
-- Idempotente (IF NOT EXISTS): seguro de correr más de una vez.

-- AlterTable: columnas de consentimiento en community_members (Art. 16)
ALTER TABLE "community_members"
  ADD COLUMN IF NOT EXISTS "consented_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_version" TEXT;

-- CreateTable: audit_log (registro de actividad sobre datos personales)
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_email" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log"("action");
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log"("created_at");
