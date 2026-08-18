# Impacto Indígena News

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Looking for Maintainer](https://img.shields.io/badge/looking%20for-maintainer-orange)](https://impactoindigena.news/stewardship)

Plataforma editorial que cubre a los pueblos indígenas como protagonistas activos: innovadores, titulares de derechos y constructores de futuro. Rastrea fuentes de noticias de siete regiones del mundo, evalúa su relevancia mediante inteligencia artificial y publica historias que importan a pueblos indígenas, territorios, liderazgo y desarrollo sostenible.

**Sitio en vivo:** [impactoindigena.news](https://impactoindigena.news) · **Fuentes rastreadas:** [/fuentes](https://impactoindigena.news/fuentes) · **API pública:** [/api/docs/openapi.json](https://impactoindigena.news/api/docs/openapi.json)

## Qué hace la plataforma

El núcleo es un pipeline editorial automático que corre sin intervención humana:

```
crawl → pre-assess → assess → select → publish
```

Cada etapa es un job programado. El crawler recoge artículos de feeds RSS y de búsquedas temáticas; un modelo pequeño descarta lo irrelevante; un modelo mayor puntúa relevancia de 1 a 10, resume, traduce y clasifica; el selector elige la tanda del día y el publicador la saca. **No hay compuerta humana antes de publicar** — la revisión editorial ocurre después, desde el panel de administración.

Alrededor de ese núcleo hay funcionalidad que el pipeline alimenta:

| Área | Qué incluye |
|---|---|
| **Sitio público** | Portada, historias, temas, búsqueda semántica, archivo, comparador de coberturas, glosario, mapa |
| **Guías temáticas** | Seis guías de fondo: pueblo mapuche, consulta previa (FPIC), pueblos indígenas de Chile, Convenio 169 país por país, jurisprudencia interamericana, Declaración de la ONU (UNDRIP) |
| **Incidencia internacional** | Agenda de eventos y casos de organismos internacionales, con ingesta automática (DOCIP, Corte IDH) |
| **Comunidades** | Espacios por pueblo, territorio o causa, con digest propio |
| **Distribución** | Newsletter, podcast con audio generado, feeds RSS, alertas por correo |
| **Redes sociales** | Seis canales con publicación automática y panel propio: Bluesky, Mastodon, Instagram, LinkedIn, X/Twitter y Facebook |
| **Datos abiertos** | Endpoint de datos agregados, widgets embebibles y API pública documentada |
| **Analítica propia** | Medición de visitas sin cookies ni terceros, con filtro de bots y retención acotada |

El programador in-process ejecuta **28 jobs** distintos, desde el pipeline hasta la renovación de tokens de redes sociales y la limpieza de datos por retención legal.

## Tech Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + react-helmet-async
- **Backend:** Express + TypeScript + LangChain + Azure OpenAI (configurable: OpenAI / OpenRouter)
- **Database:** Azure PostgreSQL + pgvector (Prisma ORM)
- **Deployment:** Azure App Service (backend) + Azure Static Web Apps (frontend)
- **Storage:** Cloudflare R2 (imágenes, audio de podcast)
- **Email:** Brevo
- **CI/CD:** GitHub Actions

## Local Development

### Prerequisites

- Node.js 20.19+ (el repo fija la 22 en `.nvmrc`)
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
   npm run db:migrate:deploy --prefix server
   ```

   Usa `db:migrate:deploy`, que aplica las migraciones existentes. **No uses `db:migrate`**: ese script corre `prisma migrate dev`, que genera migraciones nuevas y puede reescribir el historial.

6. Iniciar servidores de desarrollo:
   ```bash
   # Terminal 1 — Frontend (localhost:5173)
   npm run dev --prefix client

   # Terminal 2 — Backend (localhost:3001)
   npm run dev --prefix server
   ```

7. Crear el primer usuario administrador (el script pide correo y contraseña por consola):
   ```bash
   cd server && npx tsx src/scripts/create-admin.ts
   ```

### Pruebas

```bash
npm run test --prefix server            # tests del backend
npm run test --prefix client -- --run   # tests del frontend
```

### Proveedor LLM

Configura `LLM_PROVIDER` en `server/.env`:

| Valor | Variables requeridas |
|-------|---------------------|
| `azure` (recomendado) | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_*` |
| `openai` | `OPENAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

`server/.env.sample` documenta todas las variables, agrupadas por bloque y marcando cuáles son obligatorias.

## API pública

El backend expone una especificación OpenAPI generada desde los esquemas Zod:

```
https://impactoindigena.news/api/docs/openapi.json
```

Cubre los endpoints de lectura del sitio (portada, historias, temas, feed). Requieren autenticación las rutas bajo `/api/admin`. La página [/developers](https://impactoindigena.news/developers) documenta el uso previsto.

## Deployment (Azure)

El deploy es completamente automático vía GitHub Actions al hacer push a `main`.

### Infraestructura requerida

| Servicio | Tipo | Workflow |
|----------|------|---------|
| Backend API | Azure App Service | `deploy-azure.yml` |
| Frontend | Azure Static Web Apps | `deploy-azure-frontend.yml` |
| Base de datos | Azure PostgreSQL Flexible Server | Manual (con pgvector) |
| LLM | Azure OpenAI Service | Configurado vía env vars |

Además, `ci.yml` corre lint, tipos y la batería de tests en cada pull request.

### Variables de entorno del backend

El backend lee más de 160 variables de entorno. La referencia completa, con valores por defecto y bloques temáticos, está en **`server/.env.sample`**. Lo mínimo indispensable para que arranque:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `API_URL` | URL pública del backend (para links en correos) |
| `FRONTEND_URL` | URL del frontend, para CORS |
| `JWT_SECRET` | String aleatorio de 32+ caracteres |
| `LLM_PROVIDER` | `azure`, `openai` u `openrouter` |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` | Credenciales del recurso Azure OpenAI |
| `AZURE_OPENAI_DEPLOYMENT_*` | Deployments por tier (SMALL, MEDIUM, LARGE, EMBEDDING, TTS, DALLE) |

Los bloques opcionales —redes sociales, R2, correo, agenda de incidencia, límites de concurrencia y de tasa— están documentados en `.env.sample` y desactivan su funcionalidad si faltan, sin impedir el arranque.

### Notas de arquitectura

- **Migraciones:** El workflow CI **no** corre `prisma migrate deploy`. Las migraciones se aplican manualmente a la base de producción antes del deploy que las requiera. Ver `.context/database-migrations.md`.
- **Jobs cron:** Corren in-process vía node-cron. No se necesita un worker separado. El programador lee su registro al arrancar, así que un job nuevo exige reiniciar el backend.
- **Shutdown graceful:** Maneja `SIGTERM` drenando tareas LLM en vuelo antes de desconectarse.
- **Prerendering:** El build del frontend usa `@prerenderer/rollup-plugin` con Chrome headless (corre en el runner de GitHub, no en el build container de Azure).
- **Health check:** `GET /health` verifica conectividad con la base. **No es alcanzable desde internet**: el Static Web App solo enruta `/api/*` hacia el backend, y el App Service exige autenticación en su dominio directo. Lo consumen las sondas internas de Azure. Para verificar desde fuera, usa un endpoint público que llegue a la base, como `/api/homepage`.

### Primer deploy

```bash
# 1. Aplicar migraciones a la base de producción
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/prisma/migrations/<carpeta>/migration.sql

# 2. Crear el primer usuario admin (vía SSH o consola Kudu del App Service)
cd /home/site/wwwroot && npx tsx src/scripts/create-admin.ts

# 3. Verificar que el backend responde y llega a la base
curl -o /dev/null -w '%{http_code}\n' https://impactoindigena.news/api/homepage
# Respuesta esperada: 200
```

## Project Structure

```
impactoindigena-news/
├── client/          # React frontend (Vite + TypeScript + Tailwind)
├── server/          # Express backend (Prisma + LangChain + Azure OpenAI)
├── shared/          # Tipos y constantes compartidos
├── .specs/          # Especificaciones de comportamiento (Allium) — qué garantiza el sistema
├── .context/        # Documentación de implementación (25 archivos) — cómo está construido
├── .plans/          # Planes de desarrollo activos
│   └── completed/   # Planes completados (archivo)
├── .github/
│   └── workflows/   # CI/CD: ci.yml + deploy-azure.yml + deploy-azure-frontend.yml
├── CONTRIBUTING.md
├── SECURITY.md
├── DESIGN.md        # Sistema de diseño: tipografía, color, espaciado
├── LICENSE
└── README.md
```

Dos directorios merecen explicación porque son el grueso de la documentación:

- **`.specs/`** contiene especificaciones de comportamiento en Allium. Definen reglas de dominio, entidades e invariantes. Son la fuente autoritativa sobre **qué garantiza** el sistema.
- **`.context/`** documenta la implementación de cada subsistema: pipeline, extracción, análisis LLM, autenticación, redes sociales, accesibilidad, SEO, migraciones. Léelo antes de modificar un subsistema. El índice completo está en `.context/README.md`.

## Contributing

Contributions are welcome. Ver [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo, cómo levantar el entorno y el acuerdo de contribución.

Para reportar una vulnerabilidad de seguridad, ver [SECURITY.md](SECURITY.md) — no abras un issue público.

## Stewardship

Impacto Indígena es un proyecto sin fines de lucro que busca un custodio institucional a largo plazo en periodismo indígena, tecnología cívica, o ecosistema de derechos. Si tu organización puede darle un hogar permanente a esta plataforma, visita [impactoindigena.news/stewardship](https://impactoindigena.news/stewardship).

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE). Organizations interested in running impactoindigena.news as a long-term steward can receive more accommodating license terms — see [Stewardship](https://impactoindigena.news/stewardship).
