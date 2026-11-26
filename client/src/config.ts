/**
 * El dominio publico del sitio, en un solo lugar.
 *
 * POR QUE ES UNA VARIABLE Y NO UNA CONSTANTE. El dominio se cambia en el build
 * con `VITE_SITE_URL`, sin un commit de codigo. Lo que sigue es el historial.
 *
 * 4-sep-2026: el sitio se mudo de `impactoindigena.news` a `vocesindigenas.org`.
 * Hasta ese dia el default siguio en el dominio viejo porque el nuevo devolvia
 * el 403 de HostGator, y un despliegue habria publicado canonicas rotas.
 *
 * 25-nov-2026: decision del director, el medio vuelve a llamarse Impacto
 * Indigena News y `impactoindigena.news` vuelve a ser el canonico;
 * `vocesindigenas.org` solo redirige (salvo `/api/`).
 *
 * POR QUE EL DEFAULT ES EL CANONICO Y NO EL REDIRIGIDO. Un default que apunta al
 * dominio que redirige es una trampa silenciosa: todo lo que no pase por el
 * build —un script de este repo, un entorno local, un despliegue que olvide la
 * variable— escribe ese dominio sin avisar. Ya paso en septiembre:
 * `og-image.png` se genero con el host viejo pintado encima y se sirvio asi
 * hasta el 17-sep-2026. Lo fija `lib/marca-dominio.test.ts`.
 */
export const SITE_URL: string =
  (import.meta.env?.VITE_SITE_URL as string | undefined) ?? 'https://impactoindigena.news'

/** El dominio sin protocolo, para mostrarlo en texto. */
export const SITE_HOST: string = SITE_URL.replace(/^https?:\/\//, '')

// Centralized brand copy used across the site
export const ECOSYSTEM_AI_URL = 'https://impactoindigena.ai'
/** La casa del grupo Impacto Indígena: enlace de pertenencia, no de patrocinio (25-nov-2026). */
export const GROUP_HOME_URL = 'https://impactoindigena.com'

export const BRAND = {
  claim: 'Noticias que importan a los pueblos indígenas.',
  claimSupport: 'Curado con cuidado por IA.',
} as const
export const GITHUB_REPO_URL = 'https://github.com/Fundacion-KM/impactoindigena-news'
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
