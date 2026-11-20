/**
 * Deja UNA sola metaetiqueta `robots` en el HTML horneado.
 *
 * EL DEFECTO (medido en vivo el 20-nov-2026): `index.html` trae por defecto
 * `<meta name="robots" content="index, follow, max-image-preview:large, ...">`
 * para todo el sitio, y las paginas que no quieren ser indexadas agregan la suya
 * con Helmet (`noindex, follow` en /search). Helmet no puede borrar una etiqueta
 * que no creo, asi que el HTML de /search salia con las dos, contradiciendose.
 * Google se queda con la mas restrictiva; otros rastreadores, no necesariamente.
 *
 * LA REGLA: si la pagina fijo la suya (Helmet las marca con `data-rh`), esa
 * manda y se borran las genericas. Si no fijo ninguna, el HTML queda intacto y
 * vale la del sitio.
 */
const META_ROBOTS = /<meta\b[^>]*\bname=["']robots["'][^>]*>\s*/gi

export function unaSolaMetaRobots(html: string): string {
  const todas = html.match(META_ROBOTS) ?? []
  const dePagina = todas.filter((m) => /\bdata-rh\b/i.test(m))
  if (dePagina.length === 0 || dePagina.length === todas.length) return html
  return html.replace(META_ROBOTS, (m) => (/\bdata-rh\b/i.test(m) ? m : ''))
}
