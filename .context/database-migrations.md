# Database Migrations

## Why This Workflow Exists

Prisma's `migrate dev` command causes persistent issues on Windows: DLL engine files get locked, the dev server holds database connections that block migrations, and failed runs leave PostgreSQL advisory locks that prevent all subsequent attempts. The workflow below avoids these problems by generating SQL files and applying them manually through pgAdmin.

**Claude Code must follow this workflow for all database migrations. Do not run `prisma migrate dev` or `npm run db:migrate` directly.**

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

3. **Never run `prisma migrate dev` or `npm run db:migrate`.** This applies migrations directly and causes DLL locks on Windows. Use the create-only workflow below.

4. **Do not run `db:generate` without asking the user first.** The `prisma generate` command replaces the query engine DLL. If the dev server is running, the DLL is locked by the Node process and the command will fail with `EPERM: operation not permitted`. Before running `db:generate`, tell the user to stop their dev server, wait for confirmation, then run the command. After it succeeds, tell the user they can restart the server.

## Migration Workflow

### Step 1: Edit the Prisma Schema

Make changes to `server/prisma/schema.prisma`.

### Step 2: Generate the Migration SQL

Create the migration folder and SQL file without applying it:

```bash
npm run db:migrate:create --prefix server -- --name migration_name
```

This creates `server/prisma/migrations/<timestamp>_migration_name/migration.sql` but does **not** execute it against the database.

If even this command fails (DLL lock), use `migrate diff` to print the SQL to stdout instead:

```bash
npm run db:migrate:diff --prefix server -- --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script
```

If no `db:migrate:diff` script exists, ask the user to run the `npx prisma migrate diff` command themselves, since it requires database access. Then create the migration folder and SQL file manually using file tools and proceed to step 3.

### Step 3: Ask the User to Run the SQL in pgAdmin

**Do not attempt to apply the migration SQL from the terminal.** Instead:

1. Tell the user the path to the generated `.sql` file.
2. Ask them to open it, copy the SQL, and execute it in pgAdmin's query tool.
3. Wait for the user to confirm it ran successfully before proceeding.

### Step 4: Mark the Migration as Applied

Once the user confirms the SQL ran successfully:

```bash
npm run db:migrate:resolve --prefix server -- --applied <timestamp>_migration_name
```

This updates Prisma's `_prisma_migrations` tracking table so it knows the migration was already applied. Use the full folder name (e.g. `20260131120000_add_user_roles`).

### Step 5: Regenerate the Prisma Client

**Before running this step, ask the user to stop their dev server.** The query engine DLL is locked while the server is running, and `prisma generate` will fail with `EPERM` if it cannot replace the file. Wait for the user to confirm the server is stopped before proceeding.

```bash
npm run db:generate --prefix server
```

This updates the generated TypeScript types to match the new schema. Do not add any flags to this command. After it succeeds, tell the user they can restart their dev server.

## Command Reference

**Always use these (npm wrappers with `--prefix server`):**

| Command | Purpose |
|---|---|
| `npm run db:migrate:create --prefix server -- --name <name>` | Generate migration SQL without applying |
| `npm run db:migrate:resolve --prefix server -- --applied <name>` | Mark migration as applied |
| `npm run db:migrate:resolve --prefix server -- --rolled-back <name>` | Mark failed migration as rolled back |
| `npm run db:migrate:status --prefix server` | Check which migrations are pending/applied |
| `npm run db:migrate:deploy --prefix server` | Apply pending migrations (CI/production only) |
| `npm run db:generate --prefix server` | Regenerate Prisma client types (**ask user to stop dev server first**) |

**Never use these (direct commands that skip `.env` or cause DLL locks):**

| Command | Why it's banned |
|---|---|
| `npx prisma migrate dev` | DLL locks, applies directly |
| `npx prisma migrate resolve` | No `.env`, fails with missing DATABASE_URL |
| `npx prisma generate` | No `.env`; may accidentally get `--no-engine` flag |
| `npx prisma generate --no-engine` | Generates Accelerate-only client, breaks all queries |
| `npm run db:migrate --prefix server` | Alias for `prisma migrate dev` |

## Troubleshooting

### Stuck Advisory Lock

If a previous migration attempt left a PostgreSQL advisory lock, all migration commands will hang. Ask the user to run this in pgAdmin:

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

To see what SQL would bring the database in sync with the current schema (useful for debugging), ask the user to run:

```bash
npx prisma migrate diff --from-url DATABASE_URL --to-schema-datamodel server/prisma/schema.prisma --script
```

This requires the actual database URL, so the user must run it themselves or substitute the value.
