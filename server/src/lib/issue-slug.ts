/**
 * Alias de slugs de seccion, para que renombrar una no rompa lo que ya apunta
 * a ella.
 *
 * Un slug de seccion no es solo una URL del sitio: viaja en el sitemap, en
 * `/api/stories?issueSlug=`, en los datos abiertos que documenta
 * `/datos-abiertos` y en los widgets embebibles que terceros pegan en sus
 * paginas. Una redireccion 301 arregla la navegacion web y no arregla nada de
 * lo demas, porque esas llamadas no pasan por el enrutador del sitio.
 *
 * Por eso el slug viejo sigue RESOLVIENDO en el backend en vez de morir, y solo
 * la web redirige al nuevo.
 */

/** Slug legado -> slug canonico. */
const ALIAS: Record<string, string> = {
  // La seccion se llama "Economias Indigenas" desde agosto de 2026; su slug
  // seguia diciendo "desarrollo sostenible y autodeterminado", que era el
  // nombre anterior y describe otra cosa.
  'desarrollo-sostenible-y-autodeterminado': 'economias-indigenas',
}

/**
 * Devuelve el slug canonico de una seccion. Idempotente: aplicar dos veces da
 * lo mismo, porque un slug canonico no es alias de nadie.
 */
export function canonicalIssueSlug(slug: string): string {
  return ALIAS[slug] ?? slug
}

/** Los slugs legados, para documentarlos y para las redirecciones del sitio. */
export const LEGACY_ISSUE_SLUGS = Object.keys(ALIAS)
