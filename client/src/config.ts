/**
 * El dominio publico del sitio, en un solo lugar.
 *
 * POR QUE ES UNA VARIABLE Y NO UNA CONSTANTE. El rebrand a Voces Indigenas
 * quedo escrito en el codigo antes de que `vocesindigenas.org` estuviera
 * sirviendo: al 4-sep-2026 ese dominio devuelve el 403 de HostGator. Con el
 * dominio nuevo escrito a mano en `seo.tsx`, cualquier despliegue habria
 * publicado canonicas y `og:image` apuntando a un 403 — que es como se pierde
 * el posicionamiento de golpe.
 *
 * Asi el codigo del rebrand puede desplegarse HOY, sirviendo todavia el dominio
 * viejo, y el cambio de dominio pasa a ser una variable de entorno en la
 * configuracion del build: `VITE_SITE_URL=https://vocesindigenas.org`. Un
 * cambio de dominio no deberia exigir un commit.
 */
export const SITE_URL: string =
  (import.meta.env?.VITE_SITE_URL as string | undefined) ?? 'https://impactoindigena.news'

/** El dominio sin protocolo, para mostrarlo en texto. */
export const SITE_HOST: string = SITE_URL.replace(/^https?:\/\//, '')

// Centralized brand copy used across the site
export const ECOSYSTEM_AI_URL = 'https://impactoindigena.ai'

export const BRAND = {
  claim: 'Noticias que importan a los pueblos indígenas.',
  claimSupport: 'Curado con cuidado por IA.',
} as const
export const GITHUB_REPO_URL = 'https://github.com/vconuepan/impactoindigena-news'
export const GITHUB_LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`

/**
 * Donde vive el snapshot de la portada, servido desde el borde de Cloudflare.
 *
 * El Static Web App esta en East US 2 y el App Service en Chile Central, asi
 * que cada llamada a /api/* viaja a Virginia y vuelve: medido el 5-sep-2026,
 * 1,54-1,76 s de TTFB contra 0,11-0,34 s del mismo backend consultado directo.
 * El snapshot evita ese viaje — 0,68-0,81 s, servido desde Sao Paulo.
 *
 * Vacio en desarrollo: sin el, el cliente pide al endpoint de siempre.
 */
/*
 * `import.meta.env?` con encadenamiento opcional, igual que SITE_URL arriba:
 * `vite.config.ts` importa este archivo para leer BRAND, y cuando Vite empaqueta
 * su propia configuracion NO hay `import.meta.env`. Sin el `?`, cargar la
 * configuracion revienta y no arranca ni el build ni los tests.
 */
const R2 = import.meta.env?.VITE_R2_PUBLIC_URL as string | undefined
export const HOMEPAGE_SNAPSHOT_URL = R2 ? `${R2}/homepage.json` : ''
