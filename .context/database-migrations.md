# Database Migrations

## Why This Workflow Exists

`server/.env` points at the **production** database on Azure, and `prisma migrate dev` applies every pending migration to that database before doing anything else — **also with `--create-only`** (verified in the Prisma 6.19.3 CLI on 5-oct-2026: `applyMigrations()` runs before the flag is read). Migrations in this repo are applied by hand, with SQL the director runs, so no Prisma command may write to the database from a developer machine. Historically the same workflow also avoided DLL locks on Windows; that is no longer the reason.

**Claude Code must follow this workflow for all database migrations. Do not run `prisma migrate dev` or `npm run db:migrate` directly.**

**Guard rail (since 5-oct-2026):** `db:migrate`, `db:migrate:create` and `db:migrate:deploy` run `src/scripts/guard-local-db.ts` first and abort unless `DATABASE_URL` points at `localhost`, `127.0.0.1`, `::1`, `*.localhost` or `*.test` (`src/lib/dbHostGuard.ts`, with tests). The director can override with `MIGRATE_REMOTE_OK=1`; nobody else should.

## Production Migrations

**The deploy does NOT apply migrations.** Production runs on Azure (App Service + Static Web Apps) since May 2026; `.github/workflows/deploy-azure.yml` only runs `prisma generate` and `npm run build`. There is no `prisma migrate deploy` anywhere in the pipeline, and no `DATABASE_URL` secret in GitHub. This section used to describe Render, where migrations ran in the build; that is no longer true.

Consequences:

- **A migration in the repo does not exist in production until the director applies its SQL** (Step 3 below) and marks it applied (Step 4).
- **Order matters for code that reads new columns of existing models.** The deploy regenerates the Prisma client from `schema.prisma`; if a new column was added to an existing model and the SQL is not applied yet, every `findMany()` on that model without `select` fails with P2022. Prefer **new tables** (new models are safe: only new code queries them) or deploy in two phases (SQL first, then the model change). Example: `community_review_modes` is a table, not a column of `communities`, for exactly this reason (`.context/community-review.md`).
- **New code that reads new tables must tolerate their absence** (try/catch → safe default) when it runs on every request.
- **No automatic rollback.** Prisma doesn't generate down migrations. Destructive DDL (drop column/table) should be deployed in two phases: remove code references first, drop the column in a later deploy.
- **Write SQL idempotently** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`): it is run by hand and may be run twice.

## Critical Rules

1. **Never use `npx prisma` directly.** Always use the `npm run db:*` scripts with `--prefix server`. The npm scripts run from the `server/` directory where `.env` is loaded automatically. Direct `npx prisma` commands cannot access `.env` and will fail with `DATABASE_URL` not found errors.

2. **Never use `--no-engine` with `prisma generate`.** The `--no-engine` flag generates a client that requires Prisma Accelerate (`prisma://` protocol) and will break all database queries with error P6001. Always use `npm run db:generate --prefix server` which runs `prisma generate` without any flags.

3. **Never run `prisma migrate dev` or `npm run db:migrate`, with or without `--create-only`.** Both apply pending migrations against the `.env` database, which is production. Write the SQL by hand (Step 2 below).

4. **Do not run `db:generate` without asking the user first.** The `prisma generate` command replaces the query engine binary. If the dev server is running it may hold that file (on Windows the command fails with `EPERM`). Before running `db:generate`, tell the user to stop their dev server, wait for confirmation, then run the command. After it succeeds, tell the user they can restart the server.

## Migration Workflow

### Step 1: Edit the Prisma Schema

Make changes to `server/prisma/schema.prisma`.

### Step 2: Write the Migration SQL (offline)

Create `server/prisma/migrations/<timestamp>_migration_name/migration.sql` with file tools. Two ways to get the SQL, neither of which touches a database:

1. **Write it by hand**, in the style of the existing migrations (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `TEXT` + `CHECK` instead of enums). For most changes this is the shortest path.
2. **Diff the committed schema against the edited one.** `migrate diff` between two datamodel files needs no connection and no `.env`:

```bash
git show HEAD:server/prisma/schema.prisma > /tmp/schema-anterior.prisma
npm run db:migrate:diff --prefix server -- --from-schema-datamodel /tmp/schema-anterior.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Review the output before saving it: `migrate diff` does not add `IF NOT EXISTS`.

**Do not use `db:migrate:create`** to generate the file. It is `prisma migrate dev --create-only`: it connects to the `.env` database, needs a shadow database, and **applies every pending migration first**. The guard rail aborts it unless `DATABASE_URL` is local; with a local PostgreSQL it is fine.

### Step 3: Ask the Director to Run the SQL (psql or pgAdmin)

**Do not attempt to apply the migration SQL from the terminal.** The agent's reads and writes against the production database are denied anyway. Instead:

1. Tell the director the path to the `.sql` file. Include the verification queries (before/after counts) inside the file, since the agent cannot check the result.
2. The director runs it with `psql` (pgAdmin is not installed on the current Mac) after opening the firewall rule for their IP — procedure in memory `project-infraestructura`. Note that the `.env` path must be absolute when running from another directory, and the public IP can change mid-session.
3. Wait for confirmation before proceeding. If the migration seeds a `job_runs` row, remind them that the scheduler only reads `job_runs` at startup or when the job is saved from `/admin/jobs`.

### Step 4: Mark the Migration as Applied

Once the user confirms the SQL ran successfully:

```bash
npm run db:migrate:resolve --prefix server -- --applied <timestamp>_migration_name
```

This updates Prisma's `_prisma_migrations` tracking table so it knows the migration was already applied. Use the full folder name (e.g. `20260131120000_add_user_roles`).

### Step 5: Regenerate the Prisma Client

**Before running this step, ask the user to stop their dev server.** The query engine binary may be held by the running server, and `prisma generate` fails if it cannot replace the file. Wait for the user to confirm the server is stopped before proceeding.

```bash
npm run db:generate --prefix server
```

This updates the generated TypeScript types to match the new schema. Do not add any flags to this command. After it succeeds, tell the user they can restart their dev server.

## Command Reference

**Always use these (npm wrappers with `--prefix server`):**

| Command | Purpose |
|---|---|
| `npm run db:migrate:diff --prefix server -- --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script` | Print the SQL between two schema files; no database involved |
| `npm run db:migrate:resolve --prefix server -- --applied <name>` | Mark migration as applied (connects to the `.env` database; the director runs it after the SQL) |
| `npm run db:migrate:resolve --prefix server -- --rolled-back <name>` | Mark failed migration as rolled back |
| `npm run db:migrate:status --prefix server` | Check which migrations are pending/applied (read-only) |
| `npm run db:generate --prefix server` | Regenerate Prisma client types (**ask user to stop dev server first**) |

**Guarded (abort unless `DATABASE_URL` is local):**

| Command | What it would do against the `.env` database |
|---|---|
| `npm run db:migrate --prefix server` | `prisma migrate dev`: applies pending migrations |
| `npm run db:migrate:create --prefix server -- --name <name>` | `prisma migrate dev --create-only`: applies pending migrations, then creates the new folder |
| `npm run db:migrate:deploy --prefix server` | `prisma migrate deploy`: applies pending migrations. Not used by any pipeline: the deploy has no `DATABASE_URL` |

**Never use these (direct commands that skip `.env` and the guard):**

| Command | Why it's banned |
|---|---|
| `npx prisma migrate dev` | Applies pending migrations against the `.env` database; skips the guard |
| `npx prisma migrate resolve` | No `.env`, fails with missing DATABASE_URL |
| `npx prisma generate` | No `.env`; may accidentally get `--no-engine` flag |
| `npx prisma generate --no-engine` | Generates Accelerate-only client, breaks all queries |

## Troubleshooting

### Stuck Advisory Lock

If a previous migration attempt left a PostgreSQL advisory lock, all migration commands will hang. Ask the director to run this with `psql` (or pgAdmin):

```sql
SELECT pg_advisory_unlock(72707369);
```

### Migration Marked as Failed

If a migration is recorded as failed in `_prisma_migrations`:

```bash
npm run db:migrate:resolve --prefix server -- --rolled-back <migration_name>
```

Then delete the migration folder from `server/prisma/migrations/` and start over from step 2.

### Schema Drift

To compare production with the model, the director runs (read-only introspection; the URL comes from `.env`):

```bash
npm run db:migrate:diff --prefix server -- --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

**Expected output since `20261019000000_fix_schema_drift`: exactly two blocks.**

```sql
-- AlterEnum
BEGIN;
CREATE TYPE "UserType_new" AS ENUM ('ADMIN', 'EMPRESA', 'COMUNIDAD_LIDER', 'VEEDOR');
...
COMMIT;

-- DropIndex
DROP INDEX "stories_embedding_idx";
```

- **The index** is the HNSW index of semantic search (`20260206120000_add_embedding_fields`). Prisma 6 cannot model HNSW indexes, so it always shows up. **Never apply it.**
- **The enum.** Production's `UserType` is `VEEDOR, COMUNIDAD, EMPRESA, ADMIN, COMUNIDAD_LIDER`. `COMUNIDAD_LIDER` was added by hand: no migration creates it, and accounts use it. `COMUNIDAD`, which `20260503000002_fix_users_schema` created, is unused. Prisma wants to recreate the type to drop it. Nothing breaks, so it is left alone. Do not apply that block as-is either. A database built only from the migrations lacks `COMUNIDAD_LIDER`, so assigning «Comunidad Líder» fails there with 22P02, though not in production.

Anything else is drift. Classify each line before acting: if the database is right, fix `schema.prisma`; if the database is wrong, write guarded, idempotent SQL as a new migration. **Never apply the diff output as-is:** besides dropping the vector index, it converts `timestamptz` columns using the session time zone (an `America/Santiago` session shifts 12:00 UTC to 09:00).

Run it from a checkout whose `main` matches `origin/main`. On 18-oct-2026 a local `main` 27 commits behind made the four D5 tables look like drift.

Lessons from the 18-oct cleanup (22 differences: 21 from hand-written SQL that did not match the model, one from a manual change to production):

- **`DROP CONSTRAINT` does not drop an index created with `CREATE UNIQUE INDEX`.** `IF EXISTS` turns the mistake into a silent no-op. Use `DROP INDEX`. This left the old `page_views (path, date)` index alive from May to October and silently lost visits.
- **Check hand-written SQL against the model.** Build a scratch database from every `migration.sql` (local PostgreSQL 17 + pgvector, never `.env`) and diff it against `schema.prisma` with `--from-url`. The only lines should be the two blocks above, once the scratch database also has `COMUNIDAD_LIDER`.
- **An identical diff does not prove an identical catalog.** The scratch database and production gave the same 55-line diff on 18-oct, yet production already had `COMUNIDAD_LIDER` and the scratch database did not: Prisma recreates the enum in both cases, so the diff hides which values exist. Before writing a fix from a replica, read the objects it touches in production (read-only catalog queries).
