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
