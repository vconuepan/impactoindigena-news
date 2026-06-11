# Impacto Indígena News

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Looking for Maintainer](https://img.shields.io/badge/looking%20for-maintainer-orange)](https://impactoindigena.news/stewardship)

Plataforma editorial que cubre a los pueblos indígenas como protagonistas activos: innovadores, titulares de derechos y constructores de futuro. Rastrea más de 200 fuentes de noticias, evalúa su relevancia mediante inteligencia artificial y publica historias que importan a pueblos indígenas, territorios, liderazgo y desarrollo sostenible.

**Sitio en vivo:** [impactoindigena.news](https://impactoindigena.news)

## Tech Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + react-helmet-async
- **Backend:** Express + TypeScript + LangChain + Azure OpenAI (configurable: OpenAI / OpenRouter)
- **Database:** Azure PostgreSQL + pgvector (Prisma ORM)
- **Deployment:** Azure App Service (backend) + Azure Static Web Apps (frontend)
- **Storage:** Cloudflare R2 (images, podcast audio)
- **Email:** Brevo
- **CI/CD:** GitHub Actions

## Local Development

### Prerequisites

- Node.js 22+
- PostgreSQL 15+ con extensión pgvector
- Cuenta de Azure OpenAI, OpenAI, u OpenRouter (configurable vía `LLM_PROVIDER`)

### Setup

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/vconuepan/impactoindigena-news.git
   cd impactoindigena-news
   ```

2. Instalar dependencias:
   ```bash
   npm install --prefix client
   npm install --prefix server
   ```

3. Configurar base de datos:
   ```bash
   createdb impactoindigena_ai
   psql impactoindigena_ai -c 'CREATE EXTENSION IF NOT EXISTS vector;'
   ```

4. Configurar variables de entorno:
   ```bash
   cp server/.env.sample server/.env
   # Editar server/.env con DATABASE_URL, credenciales LLM, JWT_SECRET, etc.
   ```

5. Aplicar migraciones:
   ```bash
   npm run db:migrate --prefix server
   ```

6. Iniciar servidores de desarrollo:
   ```bash
   # Terminal 1 — Frontend (localhost:5173)
   npm run dev --prefix client

   # Terminal 2 — Backend (localhost:3001)
   npm run dev --prefix server
   ```

### Proveedor LLM

Configura `LLM_PROVIDER` en `server/.env`:

| Valor | Variables requeridas |
|-------|---------------------|
| `azure` (recomendado) | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_*` |
| `openai` | `OPENAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

Ver `server/.env.sample` para la lista completa de variables.

## Deployment (Azure)

El deploy es completamente automático vía GitHub Actions al hacer push a `main`.

### Infraestructura requerida

| Servicio | Tipo | Workflow |
|----------|------|---------|
| Backend API | Azure App Service | `deploy-azure.yml` |
| Frontend | Azure Static Web Apps | `deploy-azure-frontend.yml` |
| Base de datos | Azure PostgreSQL Flexible Server | Manual (con pgvector) |
| LLM | Azure OpenAI Service | Configurado vía env vars |

### Variables de entorno del backend (Azure App Service)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL de Azure |
| `API_URL` | URL pública del backend (para links en emails) |
| `FRONTEND_URL` | URL del frontend para CORS |
| `JWT_SECRET` | String aleatorio de 32+ caracteres |
| `LLM_PROVIDER` | `azure` |
| `AZURE_OPENAI_ENDPOINT` | Endpoint del recurso Azure OpenAI |
| `AZURE_OPENAI_API_KEY` | Clave del recurso Azure OpenAI |
| `AZURE_OPENAI_DEPLOYMENT_*` | Nombres de deployments por tier (SMALL, MEDIUM, LARGE, EMBEDDING, TTS, DALLE) |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 para imágenes |
| `BREVO_API_KEY` | Email transaccional |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | Auto-post Bluesky |
| `MASTODON_URL` / `MASTODON_TOKEN` | Auto-post Mastodon |

### Notas de arquitectura

- **Migraciones:** El workflow CI **no** corre `prisma migrate deploy`. Las migraciones deben aplicarse manualmente a la DB de producción antes de cada deploy que las requiera.
- **Jobs cron:** Corren in-process vía node-cron. No se necesita un worker separado.
- **Shutdown graceful:** Maneja `SIGTERM` drenando tareas LLM en vuelo antes de desconectarse.
- **Prerendering:** El build del frontend usa `@prerenderer/rollup-plugin` con Chrome headless (corre en el runner de GitHub, no en el build container de Azure).

### Primer deploy

Después de configurar la infraestructura:

```bash
# 1. Aplicar migraciones iniciales a la DB de producción
psql $DATABASE_URL -f server/prisma/migrations/.../migration.sql

# 2. Crear el primer usuario admin
# Conectar al App Service via SSH o Kudu console:
node dist/scripts/create-admin.js

# 3. Verificar health check
curl https://api.impactoindigena.news/health
# Respuesta esperada: {"status":"ok"}
```

## Project Structure

```
impactoindigena-news/
├── client/          # React frontend (Vite + TypeScript + Tailwind)
├── server/          # Express backend (Prisma + LangChain + Azure OpenAI)
├── shared/          # Tipos y constantes compartidos
├── .specs/          # Especificaciones de comportamiento (Allium)
├── .context/        # Documentación de implementación (17 archivos)
├── .plans/          # Planes de desarrollo activos
│   └── completed/   # Planes completados (archivo)
├── .github/
│   └── workflows/   # CI/CD: deploy-azure.yml + deploy-azure-frontend.yml
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, including how to set up the development environment, submit pull requests, and the project's lightweight contributor agreement.

## Stewardship

Impacto Indígena es un proyecto sin fines de lucro que busca un custodio institucional a largo plazo en periodismo indígena, tecnología cívica, o ecosistema de derechos. Si tu organización puede darle un hogar permanente a esta plataforma, visita [impactoindigena.news/stewardship](https://impactoindigena.news/stewardship).

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE). Organizations interested in running impactoindigena.news as a long-term steward can receive more accommodating license terms — see [Stewardship](https://impactoindigena.news/stewardship).
