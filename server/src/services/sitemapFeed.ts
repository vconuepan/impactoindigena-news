/**
 * Un sitemap XML como fuente, para los sitios que no publican RSS.
 *
 * POR QUE. Varios municipios de La Araucania publican noticias a diario pero
 * no tienen feed: Traiguen tiene los feeds de WordPress deshabilitados, Nueva
 * Imperial y Los Sauces corren en una plataforma (Ligup) que no los genera.
 * Los tres publican un sitemap con `<lastmod>` real por noticia (medido el
 * 12-oct-2026: Nueva Imperial 16 notas en dos semanas). Google News ya no sirve
 * de puente (su RSS dejo de traer la URL real) y Bing no admite `site:`.
 *
 * COMO. El feed se carga con la URL del sitemap. `parseFeed` lo reconoce por
 * el `<urlset>` y entrega como items las URL recientes; el crawler las trata
 * igual que las de un RSS: extrae la pagina, y el titulo y la fecha extraidos
 * mandan sobre los de aqui.
 *
 * QUE ENTRA. Solo las URL con dos niveles de ruta o mas (`/noticias/slug`),
 * con `lastmod` dentro de la ventana, y que no sean prefijo de otra URL del
 * mismo sitemap: asi quedan fuera la portada y las paginas de listado
 * (`/noticias`, `/reservas`), a las que Ligup les pone la fecha del dia.
 *
 * FILTRO POR RUTA. Si la URL del feed termina en `#solo=/noticias/`, entran
 * solo las URL cuya ruta empieza asi. El fragmento no viaja al servidor.
 *
 * LIMITE CONOCIDO. `lastmod` es la fecha de modificacion, no la de publicacion:
 * una nota vieja editada hace poco entra como reciente. El crawler la descarta
 * igual si la pagina declara una fecha vieja.
 */
import * as cheerio from 'cheerio'
import type { RSSItem } from './rssParser.js'

const FILTRO = /#solo=([^#]+)$/

/** Separa el filtro de ruta (nuestro) de la URL que se pide al servidor. */
export function separarFiltroSitemap(feedUrl: string): { fetchUrl: string; soloPrefijo: string | null } {
  const m = feedUrl.match(FILTRO)
  if (!m) return { fetchUrl: feedUrl, soloPrefijo: null }
  return { fetchUrl: feedUrl.slice(0, m.index), soloPrefijo: decodeURIComponent(m[1]) }
}

export type TipoSitemap = 'urlset' | 'indice' | null

/** Mira solo el comienzo del documento: un RSS que cite «<urlset» en un item no se confunde. */
export function tipoSitemap(xml: string): TipoSitemap {
  const cabeza = xml.slice(0, 2000)
  if (/<sitemapindex[\s>]/.test(cabeza)) return 'indice'
  if (/<urlset[\s>]/.test(cabeza)) return 'urlset'
  return null
}

/** Titulo provisional desde el slug; el crawler lo reemplaza por el de la pagina. */
export function tituloDesdeSlug(url: string): string {
  let seg = ''
  try {
    seg = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
  } catch {
    return 'Untitled'
  }
  try {
    seg = decodeURIComponent(seg)
  } catch {
    // slug con % suelto: se usa tal cual
  }
  // Ligup agrega el id al final («...-24694», «...-id-24576»).
  const limpio = seg.replace(/(?:-id)?-\d+$/, '').replace(/[-_]+/g, ' ').trim()
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : 'Untitled'
}

function segmentos(pathname: string): number {
  return pathname.split('/').filter(Boolean).length
}

export interface OpcionesSitemap {
  ahora: Date
  maxAgeDays: number
  limit: number
  soloPrefijo: string | null
}

/** Las URL recientes de un `<urlset>`, de la mas nueva a la mas vieja, como items de feed. */
export function itemsDesdeSitemap(xml: string, opts: OpcionesSitemap): RSSItem[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const entradas: Array<{ url: string; path: string; lastmod: Date; imagen: string | null }> = []

  $('url').each((_, el) => {
    const loc = $(el).children('loc').first().text().trim()
    const lastmodTxt = $(el).children('lastmod').first().text().trim()
    if (!loc || !lastmodTxt) return
    const lastmod = new Date(lastmodTxt)
    if (isNaN(lastmod.getTime())) return
    let path: string
    try {
      path = new URL(loc).pathname
    } catch {
      return
    }
    const imagen = $(el).find('image\\:loc').first().text().trim() || null
    entradas.push({ url: loc, path, lastmod, imagen })
  })

  // Una pagina de listado es prefijo de alguna otra URL del sitemap.
  const paths = new Set(entradas.map((e) => e.path.replace(/\/+$/, '')))
  const esListado = (path: string): boolean => {
    const base = path.replace(/\/+$/, '') + '/'
    for (const p of paths) if (p.startsWith(base)) return true
    return false
  }

  const desde = opts.ahora.getTime() - opts.maxAgeDays * 24 * 60 * 60 * 1000
  return entradas
    .filter((e) => segmentos(e.path) >= 2)
    .filter((e) => !opts.soloPrefijo || e.path.startsWith(opts.soloPrefijo))
    .filter((e) => opts.maxAgeDays <= 0 || e.lastmod.getTime() >= desde)
    .filter((e) => !esListado(e.path))
    .sort((a, b) => b.lastmod.getTime() - a.lastmod.getTime())
    .slice(0, opts.limit)
    .map((e) => ({
      url: e.url,
      title: tituloDesdeSlug(e.url),
      datePublished: e.lastmod.toISOString(),
      description: null,
      imageUrl: e.imagen,
    }))
}
