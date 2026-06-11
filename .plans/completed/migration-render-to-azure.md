# Plan de migración: Render → Azure

**Fecha:** 2026-05-26
**Estado:** Pendiente
**Objetivo:** Migrar frontend y backend de Render a Azure para consolidar infraestructura, reducir latencia, y centralizar todo en una suscripción.

---

## Estado actual (Render)

| Servicio | Tipo | Plan | URL |
|----------|------|------|-----|
| `vocesindigenas-frontend` | Static Site | Free | impactoindigena.news |
| `vocesindigenas-backend` | Web Service (Node) | Starter ($7/mes) | vocesindigenas-backend.onrender.com |

**Problemas actuales:**
- Backend en Oregon (Render) → DB en Chile Central (Azure) = ~80ms+ de latencia por query
- Dos proveedores cloud para un mismo proyecto
- Sin VNet/private networking entre backend y DB

## Estado actual (Azure — cuenta @fundacionconuepanmillaquir)

**Suscripción:** `3c86db51-8e31-498f-a5c6-142db2efb9a9`
**Tenant:** `fb511433-f0e8-4ae0-b4bf-e0b90f96f7c0`
**Resource Group:** `impactoindigena-rg`

Recursos ya existentes que usa Impacto Indígena:
- **DB:** `impactoindigena-db` (PostgreSQL Flexible Server, Chile Central)
- **OpenAI:** `impactoindigena-openai` (Azure OpenAI, East US 2)
- **OpenAI Images:** `venan-mosxoayz-swedencentral` (Sweden Central)
- **DNS:** `impactoindigena.ai`, `impactoindigena.com`
- **Comms:** `impactoindigena-comms` (Communication Services)

App Service Plans existentes (ya con carga):
- `plan-impactoindigena` (B1): 5 apps (impactoindigena-ai, kellu-ingles, kallfu-360, kellu-coach, kellu-agenda)
- `consentimiento-plan` (B1): 1 app (consentimiento-indigena)

---

## Arquitectura destino

```
impactoindigena.news (dominio)
├── Frontend: Azure Static Web Apps (Free tier)
│   ├── Build: GitHub Actions (Vite + prerendering)
│   ├── CDN global, SSL automático
│   └── VITE_API_URL directo al backend (sin proxy)
│
├── Backend: Azure App Service (plan existente, Chile Central)
│   ├── Plan: plan-impactoindigena (EXISTENTE, B1 Linux — 5 apps Kellu de bajo uso)
│   ├── App: impactoindigena-news-api (NUEVA, se agrega al plan existente)
│   ├── Runtime: Node.js 22 LTS
│   ├── Deploy: GitHub Actions (push to main)
│   └── Startup: npm start
│
├── DB: impactoindigena-db (PostgreSQL Flexible, Chile Central) ← YA EXISTE
└── AI: impactoindigena-openai (Azure OpenAI, East US 2) ← YA EXISTE
```

---

## Costos comparativos

| Concepto | Render (actual) | Azure (propuesto) |
|----------|----------------|-------------------|
| Frontend hosting | $0 (Static Site) | $0 (Static Web Apps Free) |
| Backend hosting | $7/mes (Starter) | $0 (usa plan-impactoindigena existente) |
| DB | Ya en Azure | Ya en Azure |
| **Total** | **$7/mes** | **$0/mes** |

**Beneficio neto:** Ahorro de $7/mes + se gana:
- Latencia backend↔DB de ~80ms → ~1-3ms (misma región)
- Red unificada (posibilidad futura de VNet)
- Un solo proveedor, un solo billing
- Escalamiento más flexible (B1→B2→S1 en un click)

**Nota:** El plan B1 (1.75 GB RAM) ya tiene 5 apps (impactoindigena-ai, kellu-ingles, kallfu-360, kellu-coach, kellu-agenda) pero todas son de bajo uso. Si se detectan problemas de rendimiento, escalar a B2 ($13/mes adicional).

---

## Pasos de migración

### Fase 1: Crear recursos Azure (~15 min)

#### 1.1 Crear App Service (en plan existente)
```
Nombre: impactoindigena-news-api
Plan: plan-impactoindigena (EXISTENTE — B1 Linux, Chile Central)
Resource Group: impactoindigena-rg
Runtime: Node 22 LTS
Startup command: npm start
```
No se crea un nuevo plan. Se reutiliza `plan-impactoindigena`.

### Fase 2: Configurar variables de entorno

#### Variables REQUERIDAS (con secretos — copiar de Render)

| Variable | Origen | Notas |
|----------|--------|-------|
| `DATABASE_URL` | Render env | Connection string PostgreSQL Azure |
| `JWT_SECRET` | Render env | Token de autenticación admin |
| `DIFFBOT_TOKEN` | Render env | Extracción de artículos |
| `BREVO_API_KEY` | Render env | Newsletter |
| `BREVO_FROM_EMAIL` | Render env | Email remitente |
| `OPENROUTER_API_KEY` | Render env | LLM (si se mantiene OpenRouter) |
| `OPENAI_API_KEY` | Render env | Embeddings |
| `BLUESKY_HANDLE` | Render env | Social posting |
| `BLUESKY_APP_PASSWORD` | Render env | Social posting |
| `MASTODON_URL` | Render env | Social posting |
| `MASTODON_TOKEN` | Render env | Social posting |
| `R2_ENDPOINT` | Render env | Cloudflare R2 (media) |
| `R2_ACCESS_KEY_ID` | Render env | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Render env | Cloudflare R2 |
| `R2_PUBLIC_URL` | Render env | Cloudflare R2 |
| `TWITTER_API_KEY` | Render env | Social posting (si habilitado) |
| `TWITTER_API_SECRET` | Render env | Social posting |
| `TWITTER_ACCESS_TOKEN` | Render env | Social posting |
| `TWITTER_ACCESS_TOKEN_SECRET` | Render env | Social posting |
| `INSTAGRAM_ACCESS_TOKEN` | Render env | Social posting (si habilitado) |
| `INSTAGRAM_USER_ID` | Render env | Social posting |
| `LINKEDIN_ACCESS_TOKEN` | Render env | Social posting (si habilitado) |
| `LINKEDIN_AUTHOR_URN` | Render env | Social posting |

#### Variables con valores fijos

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (Azure default) |
| `SITE_URL` | `https://impactoindigena.news` |
| `FRONTEND_URL` | `https://impactoindigena.news` |
| `CLIENT_URL` | `https://impactoindigena.news` |
| `LOG_LEVEL` | `info` |
| `LLM_PROVIDER` | `openrouter` (o `azure` si migramos a Azure OpenAI) |
| `OPENAI_MODEL_SMALL` | `deepseek/deepseek-v3.2` |
| `OPENAI_MODEL_MEDIUM` | `deepseek/deepseek-v3.2` |
| `OPENAI_MODEL_LARGE` | `deepseek/deepseek-v3.2` |
| `BREVO_FROM_NAME` | `Impacto Indígena` |
| `BLUESKY_AUTO_POST_ENABLED` | `false` |
| `MASTODON_AUTO_POST_ENABLED` | `false` |
| `TWITTER_AUTO_POST_ENABLED` | `false` |
| `INSTAGRAM_AUTO_POST_ENABLED` | `false` |
| `LINKEDIN_AUTO_POST_ENABLED` | `false` |
| `PODCAST_AUTO_GENERATE_ENABLED` | `false` |

#### Decisión pendiente: LLM Provider

Actualmente usa OpenRouter (DeepSeek) para LLM y OpenAI directo para embeddings.
Opción: migrar a Azure OpenAI (`impactoindigena-openai`) para todo:
- **Pro:** Un solo proveedor, sin costos OpenRouter, latencia potencialmente mejor
- **Con:** Requiere verificar modelos disponibles en el recurso Azure OpenAI
- **Recomendación:** Mantener OpenRouter por ahora, migrar LLM a Azure OpenAI después

### Fase 3: GitHub Actions para deploy (~30 min)

Crear `.github/workflows/deploy-azure.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest
    if: contains(join(github.event.commits.*.modified, ','), 'server/') || contains(join(github.event.commits.*.added, ','), 'server/')
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install & Build
        run: |
          npm install --prefix server --include=dev
          npm run db:generate --prefix server
          npm run build --prefix server
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: impactoindigena-news-api
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: server/

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    if: contains(join(github.event.commits.*.modified, ','), 'client/') || contains(join(github.event.commits.*.added, ','), 'client/') || contains(join(github.event.commits.*.modified, ','), 'shared/')
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: client/package-lock.json

      - name: Install & Build
        run: npm install --prefix client && npm run build --prefix client
        env:
          VITE_API_URL: https://impactoindigena-news-api.azurewebsites.net

      - name: Deploy to Azure Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_SWA_TOKEN }}
          action: upload
          app_location: client/dist
          skip_app_build: true
```

### Fase 4: Configurar Static Web Apps (~15 min)

#### 4.1 Crear Static Web App
- Conectar al repo de GitHub
- Branch: main
- App location: client/dist
- Skip build (lo hace GitHub Actions)

#### 4.2 Crear archivo de routing (`client/staticwebapp.config.json`)

```json
{
  "routes": [
    { "route": "/sitemap.xml", "rewrite": "https://impactoindigena-news-api.azurewebsites.net/api/sitemap.xml" },
    { "route": "/podcast/feed.xml", "rewrite": "https://impactoindigena-news-api.azurewebsites.net/api/podcast/feed.xml" },
    { "route": "/api/*", "rewrite": "https://impactoindigena-news-api.azurewebsites.net/api/*" }
  ],
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/favicon.ico", "/*.png", "/*.xml", "/*.txt"]
  },
  "responseOverrides": {
    "404": {
      "rewrite": "/index.html",
      "statusCode": 200
    }
  }
}
```

**NOTA:** Azure Static Web Apps Free tier NO soporta rewrites a URLs externas (proxy inverso). Solo el plan Standard ($9/mes) lo permite. Alternativas:
1. **Usar Standard ($9/mes)** para tener proxy inverso nativo
2. **CORS directo:** El frontend llama directo al backend Azure (cambiar `VITE_API_URL`), sin proxy. Más simple, funciona con Free tier.
3. **Azure Front Door:** Overkill para este caso.

**Recomendación:** Opción 2 (CORS directo). El frontend ya configura `VITE_API_URL` apuntando al backend. Solo hay que asegurar CORS en el backend para el dominio `impactoindigena.news`.

### Fase 5: DNS y custom domains (~20 min)

#### 5.1 Backend custom domain (opcional)
- Opción A: Usar `impactoindigena-news-api.azurewebsites.net` directamente
- Opción B: Crear subdomain `api.impactoindigena.news` apuntando al App Service
- **Recomendación:** Opción A por simplicidad. La URL de API no es visible al usuario.

#### 5.2 Frontend custom domain
1. En Azure Static Web Apps → Custom domains
2. Agregar `impactoindigena.news` y `www.impactoindigena.news`
3. Requiere agregar registro CNAME en el proveedor DNS actual
4. SSL se genera automáticamente (Let's Encrypt)

**¿Dónde está el DNS de impactoindigena.news?** 
- NO está en Azure DNS (solo están .ai y .com)
- Probablemente en el registrar original (Cloudflare, GoDaddy, etc.)
- Hay que identificar el proveedor DNS actual y cambiar los registros

### Fase 6: Verificación y cutover

#### 6.1 Pre-cutover (backend en Azure, frontend aún en Render)
1. Desplegar backend en Azure
2. Verificar health check: `https://impactoindigena-news-api.azurewebsites.net/health`
3. Verificar API responses: `/api/homepage`, `/api/stories`
4. Verificar cron jobs funcionando (crawl, assess, etc.)
5. Verificar que la DB responde correctamente

#### 6.2 Cutover gradual
1. Actualizar `VITE_API_URL` en Render frontend para apuntar al backend Azure
2. Verificar que el sitio funciona con backend Azure + frontend Render
3. Una vez confirmado, migrar frontend a Static Web Apps
4. Actualizar DNS de impactoindigena.news
5. Esperar propagación DNS (hasta 48h, usualmente minutos)

#### 6.3 Post-cutover
1. Verificar SSL en custom domain
2. Verificar todas las rutas (homepage, stories, admin, newsletter archive, podcast)
3. Habilitar social auto-posting si estaba activo
4. Monitorear logs por 24-48h
5. Apagar servicios en Render (NO borrar hasta confirmar 1 semana estable)

---

## Resumen de recursos a crear

| Recurso | Tipo | Costo |
|---------|------|-------|
| `impactoindigena-news-api` | App Service (Node 22) en plan existente | $0/mes |
| Static Web App | Free tier | $0/mes |
| **Total nuevo** | | **$0/mes** |

Se elimina el gasto de Render ($7/mes). Ahorro neto: **$7/mes**.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| B1 compartido insuficiente (6 apps) | Monitorear CPU/RAM primera semana; escalar plan a B2 ($13/mes) si > 80% |
| DNS propagation lenta | Hacer cutover en horario bajo (noche Chile) |
| Prisma migrate deploy falla | Probar migration en staging primero |
| CORS issues con VITE_API_URL directo | Backend ya tiene CORS configurado; solo agregar nuevo origin |
| Static Web Apps no soporta rewrites (Free) | Usar CORS directo, sin proxy |

## Tareas para el usuario (no automatizables)

1. [ ] Copiar valores de env vars secretas desde Render Dashboard
2. [ ] Identificar proveedor DNS de impactoindigena.news
3. [ ] Configurar GitHub secrets (AZURE_WEBAPP_PUBLISH_PROFILE, AZURE_SWA_TOKEN)
4. [ ] Verificar billing Azure después de crear recursos
5. [ ] Apagar Render después de 1 semana estable
