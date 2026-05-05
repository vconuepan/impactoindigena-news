# Impacto Indígena News

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Looking for Maintainer](https://img.shields.io/badge/looking%20for-maintainer-orange)](https://impactoindigena.news/stewardship)

Noticias, iniciativas y tendencias relevantes para los pueblos indígenas, 
seleccionadas con apoyo de inteligencia artificial.

Impacto Indígena es una plataforma editorial que rastrea fuentes de noticias, 
evalúa su relevancia mediante inteligencia artificial y publica historias 
que impactan a pueblos indígenas, territorios, liderazgo, empresas indígenas 
y desarrollo sostenible.

## Tech Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS
- **Backend:** Express + TypeScript + LangChain + OpenAI
- **Database:** PostgreSQL + pgvector (Prisma ORM)
- **Deployment:** Render.com

## Local Development

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+ (with pgvector extension)
- OpenAI API key

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/OdinMB/actually-relevant.git
   cd actually-relevant
   ```

2. Install dependencies:
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```

3. Set up the database:
   ```bash
   # Create the database
   createdb actually_relevant

   # Enable pgvector extension (connect to DB first)
   psql actually_relevant -c 'CREATE EXTENSION IF NOT EXISTS vector;'
   ```

4. Configure environment variables:
   ```bash
   # Create server/.env with at minimum these required variables:
   # DATABASE_URL, OPENAI_API_KEY, JWT_SECRET, FRONTEND_URL
   # See server/src/config.ts for all available settings and their defaults.
   ```

5. Run database migrations:
   ```bash
   cd server && npx prisma migrate dev
   ```

6. Start development servers:
   ```bash
   # Terminal 1 — Frontend (localhost:5173)
   cd client && npm run dev

   # Terminal 2 — Backend (localhost:3001)
   cd server && npm run dev
   ```

## Deploying to Render.com

This project requires **three services** on Render: a managed PostgreSQL database, an Express backend (web service), and a React frontend (static site). The backend and frontend run on separate origins.

### 1. PostgreSQL Database

1. Create a new PostgreSQL instance on Render
2. Note the **Internal Database URL** (used by the backend service)
3. Enable pgvector — connect to the database and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 2. Backend (Web Service)

| Field | Value |
|-------|-------|
| **Root Directory** | `server` |
| **Build Command** | `npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/health` |

The build generates the Prisma client, applies any pending database migrations, and compiles TypeScript. Migrations run automatically on every deploy via `prisma migrate deploy`, which is a no-op when there are no pending migrations.

**Environment Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Internal PostgreSQL connection string from step 1 |
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM analysis |
| `FRONTEND_URL` | Yes | Frontend URL for CORS (e.g. `https://impactoindigena.news`) |
| `JWT_SECRET` | Yes | Random string (32+ chars) for signing auth tokens |
| `NODE_ENV` | Yes | Set to `production` (enables secure cross-origin cookies) |
| `PORT` | No | Render sets this automatically (defaults to 10000) |
| `PUBLIC_API_KEY` | No | Static API key for public consumers (mobile apps, etc.) |
| `LOG_LEVEL` | No | Logging verbosity (default: `info`) |

**Architecture notes:**

- **Cron jobs** run in-process via node-cron — no separate worker service is needed. Job configuration lives in the `job_runs` database table and is managed from the admin dashboard.
- **Graceful shutdown** handles `SIGTERM` (sent by Render on deploy) by draining in-flight LLM tasks before disconnecting from the database.
- **Reverse proxy** trust is configured (`trust proxy: 1`) for correct client IP detection behind Render's load balancer.
- **Cross-origin cookies** use `sameSite: 'none'` + `secure: true` in production, which is required because the frontend and backend are on different Render origins. This is why `NODE_ENV=production` is mandatory.

### 3. Frontend (Static Site)

| Field | Value |
|-------|-------|
| **Root Directory** | `client` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

The build type-checks, bundles with Vite, and prerenders public routes using Puppeteer. Render's build environment includes Chromium, so prerendering works without extra setup.

**Rewrite rules:** Add these rewrites in the Render dashboard **in this exact order** (Render evaluates rules top-to-bottom, first match wins):

| Source | Destination | Action |
|--------|-------------|--------|
| `/sitemap.xml` | `https://<backend-service>.onrender.com/api/sitemap.xml` | Rewrite |
| `/*` | `/index.html` | Rewrite |

**Order is critical:** The `/sitemap.xml` rule must appear *before* the catch-all `/*` rule. If reversed, the catch-all matches first and serves the SPA shell, resulting in a 404.

The sitemap rewrite proxies requests to the backend, which generates the sitemap dynamically from published stories. No static `sitemap.xml` file should exist in `client/public/` — Render serves static files before applying rewrite rules.

**Environment Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend URL (e.g. `https://api.impactoindigena.news`) |

### Post-deploy Steps

1. Set backend `FRONTEND_URL` to match the frontend URL (and vice versa for `VITE_API_URL`)
2. Database migrations run automatically during the build step — no manual action needed
3. Create the first admin user from the Render shell:
   ```bash
   npx tsx src/scripts/create-admin.ts
   ```
4. Add the `/sitemap.xml` rewrite rule to the static site (see Frontend section above)
5. Verify the health endpoint: `curl https://<backend-url>/health`
6. Verify the sitemap: `curl https://<frontend-url>/sitemap.xml`

## Project Structure

```
actually-relevant/
├── client/          # React frontend
│   ├── src/         # Source code
│   ├── scripts/     # Build scripts (sitemap, images)
│   ├── dist/        # Built output (gitignored)
│   └── package.json
├── server/          # Express backend
│   ├── src/         # Source code
│   ├── prisma/      # Database schema and migrations
│   ├── dist/        # Built output (gitignored)
│   └── package.json
├── shared/          # Shared types and constants
├── .context/        # Implementation documentation (17 files)
├── .specs/          # Behavioral specifications (Allium)
├── CONTRIBUTING.md  # Contribution guidelines
├── LICENSE          # AGPL v3
└── README.md        # This file
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, including how to set up the development environment, submit pull requests, and the project's lightweight contributor agreement.

## Stewardship

Actually Relevant is actively seeking a long-term institutional owner in journalism, civic tech, or effective altruism. If your organization could give this project a home, visit [impactoindigena.news/stewardship](https://impactoindigena.news/stewardship) to learn more.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE). Organizations interested in running impactoindigena.news as a long-term steward can receive more accommodating license terms — see [Stewardship](https://impactoindigena.news/stewardship).

## Troubleshooting

### Build Fails
Check the build logs. Common issues:
- Missing `Root Directory` setting on Render
- Node version mismatch — add `engines` to package.json if needed
- Missing `npx prisma generate` before server build

### API Calls Fail (CORS Error)
1. Verify `FRONTEND_URL` is set correctly on the backend
2. Ensure it matches exactly (including `https://`, no trailing slash)
3. Redeploy after changing environment variables

### Database Connection Fails
1. Verify `DATABASE_URL` is correct
2. Ensure pgvector extension is installed: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Run migrations: `npx prisma migrate deploy`

### Health Check
```bash
curl https://your-api-url.onrender.com/health
# Should return: {"status":"ok"}
```
