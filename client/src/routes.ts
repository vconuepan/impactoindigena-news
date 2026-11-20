/**
 * All routes with sitemap metadata.
 * Used by React Router, prerenderer, and sitemap generation.
 *
 * When adding a new page:
 * 1. Add route config here (path, priority, changefreq)
 * 2. Create page component in src/pages/
 * 3. Add route in App.tsx
 * 4. Rebuild to generate static HTML and updated sitemap
 */

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export interface RouteConfig {
  path: string
  priority: number
  changefreq: ChangeFreq
  /**
   * La pagina se prerenderiza pero pide `noindex`, asi que NO va al sitemap:
   * declararle a Google una URL que la propia pagina le prohibe indexar es una
   * contradiccion. El sitemap del servidor (`server/.../sitemap.ts`) la omite y
   * `sitemap-sincronia.test.ts` lo exige.
   */
  noindex?: true
}

export const routes: RouteConfig[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/issues', priority: 0.8, changefreq: 'monthly' },
  { path: '/comunidades', priority: 0.8, changefreq: 'weekly' },
  { path: '/incidencia-internacional', priority: 0.9, changefreq: 'daily' },
  { path: '/methodology', priority: 0.7, changefreq: 'monthly' },
  { path: '/about', priority: 0.7, changefreq: 'monthly' },
  { path: '/newsletter', priority: 0.6, changefreq: 'monthly' },
  { path: '/feedback', priority: 0.5, changefreq: 'monthly' },
  { path: '/imprint', priority: 0.5, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.5, changefreq: 'yearly' },
  { path: '/terminos', priority: 0.5, changefreq: 'yearly' },
  { path: '/cookies', priority: 0.5, changefreq: 'yearly' },
  // /search se prerenderiza (si no, Static Web Apps devolveria la portada) pero
  // sale del sitemap: la pagina pide `noindex`, y estar en el sitemap ayudaba a
  // que los robots la recorrieran. El 20-nov-2026 se midio que /search era la
  // pagina mas vista del panel por robots, no por lectores: de 1.994 vistas en
  // 90 dias, 1.987 entraron directo y 7 desde un clic dentro del sitio, y el
  // 98,6 % de las busquedas eran un titular completo, el enlace «Buscar
  // similares» de cada ficha. Ver docs/propuesta-analytics-bots.md.
  { path: '/search', priority: 0.3, changefreq: 'daily', noindex: true },
  { path: '/saved', priority: 0.3, changefreq: 'daily' },
  // /subscribed NO se prerenderiza: lo que muestra depende del token de la URL
  // (pide confirmar, o celebra, o avisa de un enlace invalido), y el HTML horneado
  // diria «Tu suscripcion quedo confirmada» a quien aun no confirmo nada. Se ve
  // hasta que carga el JS: main.tsx usa createRoot, no hydrateRoot. Tampoco va en
  // el sitemap: es una pagina de un solo uso, sin nada que indexar.
  { path: '/thank-you', priority: 0.2, changefreq: 'yearly' },
  // Distribucion, datos abiertos y paginas editoriales. Estaban en el sitemap
  // del servidor y NO aqui, asi que Google recibia diez URLs que devolvian la
  // portada byte a byte: soft 404 declarados en bandeja. Existen todas en
  // App.tsx; lo que faltaba era prerenderizarlas.
  { path: '/opendata', priority: 0.6, changefreq: 'monthly' },
  { path: '/widgets', priority: 0.6, changefreq: 'monthly' },
  { path: '/compare', priority: 0.6, changefreq: 'weekly' },
  { path: '/free-api', priority: 0.6, changefreq: 'monthly' },
  { path: '/news-fatigue', priority: 0.5, changefreq: 'monthly' },
  { path: '/por-que-importa', priority: 0.7, changefreq: 'weekly' },
  { path: '/fuentes', priority: 0.6, changefreq: 'weekly' },
  { path: '/archivo', priority: 0.6, changefreq: 'weekly' },
  { path: '/casos', priority: 0.7, changefreq: 'weekly' },
  { path: '/alertas', priority: 0.6, changefreq: 'monthly' },
  // Evergreen reference pages
  { path: '/mapa', priority: 0.8, changefreq: 'monthly' },
  { path: '/glosario', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/pueblo-mapuche', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/consulta-previa-fpic', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/pueblos-indigenas-chile', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/c169-pais-por-pais', priority: 0.8, changefreq: 'yearly' },
  { path: '/guia/jurisprudencia-interamericana', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/declaracion-onu-undrip', priority: 0.8, changefreq: 'yearly' },
  // Voces Indígenas editorial
  { path: '/voces-indigenas', priority: 0.9, changefreq: 'weekly' },
  // Dynamic routes (issues, communities, stories) added at build time
  // by vite.config.ts (prerender) and scripts/generate-sitemap.ts
]

export const routePaths = routes.map((r) => r.path)

export type Route = (typeof routePaths)[number]
