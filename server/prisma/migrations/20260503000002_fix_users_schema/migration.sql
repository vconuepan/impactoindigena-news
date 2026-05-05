-- Recreate users table to match current Prisma User model (camelCase columns, UserType enum)
-- The init migration created the wrong schema (snake_case, UserRole)

-- Drop FK constraints that reference users first
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_user_id_fkey";
ALTER TABLE "community_members" DROP CONSTRAINT IF EXISTS "community_members_user_id_fkey";
ALTER TABLE "community_posts" DROP CONSTRAINT IF EXISTS "community_posts_user_id_fkey";
ALTER TABLE "digest_exclusions" DROP CONSTRAINT IF EXISTS "digest_exclusions_user_id_fkey";

-- Drop and recreate users with correct schema
DROP TABLE IF EXISTS "users";

-- Create UserType enum
CREATE TYPE "UserType" AS ENUM ('VEEDOR', 'COMUNIDAD', 'EMPRESA', 'ADMIN');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "userType" "UserType" NOT NULL DEFAULT 'VEEDOR',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "freeLicense" BOOLEAN NOT NULL DEFAULT false,
    "comunidadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Re-add FK constraints
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "digest_exclusions" ADD CONSTRAINT "digest_exclusions_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE;
