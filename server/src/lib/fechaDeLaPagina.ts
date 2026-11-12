import * as cheerio from 'cheerio'

/**
 * La fecha de publicacion que el articulo DECLARA en su propia pagina.
 *
 * EL DEFECTO (B3 del traspaso de otras-voces, medido el 11-nov-2026). Los dos
 * metodos locales de extraccion —por selector y por Readability, los que corren
 * casi siempre: no hay DIFFBOT_TOKEN— devolvian `datePublished: null`. La pagina
 * declaraba su fecha y nadie la leia, asi que la unica fecha era la del feed o
 * la del buscador. Una nota de Pagina/12 que la pagina fecha en 2025 (y muestra
 * a la vista el 3 de diciembre de 2024) entro el 6-oct-2026 por el
 * descubrimiento de Google News con la fecha que traia el resultado, paso los
 * filtros de antiguedad y se publico el 10-oct como novedad.
 *
 * QUE SE LEE, en este orden, y solo fechas de PUBLICACION (nunca de
 * modificacion, que en muchos medios es «ahora»):
 *  1. JSON-LD de un objeto de tipo articulo (NewsArticle, Article, BlogPosting…),
 *     tambien dentro de `@graph` o de una lista. Los de tipo Organization,
 *     WebSite o BreadcrumbList no cuentan: su fecha no es la del articulo.
 *  2. `article:published_time` (property o name), la de Open Graph.
 *  3. `itemprop="datePublished"` en un `<meta>` o un `<time datetime>`.
 *  4. Las metas de editoriales y buscadores academicos mas comunes.
 *
 * Una fecha que no se puede leer, anterior a 1995 o mas de dos dias en el
 * futuro se descarta y se sigue con la siguiente: es un error de la pagina, no
 * un dato. Sin ninguna, null; quien llama usa entonces la del feed.
 */

const TIPO_ARTICULO = /(NewsArticle|Article|BlogPosting|LiveBlogPosting|Report)$/

const METAS_DE_PUBLICACION = [
  'pubdate',
  'publishdate',
  'publish-date',
  'parsely-pub-date',
  'sailthru.date',
  'dc.date.issued',
  'citation_publication_date',
]

const DOS_DIAS_MS = 2 * 24 * 60 * 60 * 1000

/** ISO si es una fecha plausible de publicacion; null si no. */
export function normalizarFecha(valor: unknown, ahora: Date = new Date()): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  if (!texto) return null
  const fecha = new Date(texto)
  const ms = fecha.getTime()
  if (isNaN(ms)) return null
  if (fecha.getUTCFullYear() < 1995) return null
  if (ms - ahora.getTime() > DOS_DIAS_MS) return null
  return fecha.toISOString()
}

function esTipoArticulo(tipo: unknown): boolean {
  const tipos = Array.isArray(tipo) ? tipo : [tipo]
  return tipos.some((t) => typeof t === 'string' && TIPO_ARTICULO.test(t))
}

/** Recorre un JSON-LD (objeto, lista o @graph) y devuelve los objetos de tipo articulo. */
function articulosDelJsonLd(nodo: unknown, salida: Record<string, unknown>[] = [], profundidad = 0): Record<string, unknown>[] {
  if (profundidad > 6 || nodo === null || typeof nodo !== 'object') return salida
  if (Array.isArray(nodo)) {
    for (const n of nodo) articulosDelJsonLd(n, salida, profundidad + 1)
    return salida
  }
  const obj = nodo as Record<string, unknown>
  if (esTipoArticulo(obj['@type'])) salida.push(obj)
  if (obj['@graph']) articulosDelJsonLd(obj['@graph'], salida, profundidad + 1)
  return salida
}

export function fechaDeclaradaEnLaPagina(html: string, ahora: Date = new Date()): string | null {
  if (!html) return null
  let $: cheerio.CheerioAPI
  try {
    $ = cheerio.load(html)
  } catch {
    return null
  }

  // 1 · JSON-LD de un articulo.
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let datos: unknown
    try {
      datos = JSON.parse($(el).contents().text())
    } catch {
      continue // un JSON-LD roto no tumba la extraccion
    }
    for (const articulo of articulosDelJsonLd(datos)) {
      const fecha = normalizarFecha(articulo.datePublished, ahora)
      if (fecha) return fecha
    }
  }

  // 2 · Open Graph.
  for (const sel of ['meta[property="article:published_time"]', 'meta[name="article:published_time"]', 'meta[property="og:article:published_time"]']) {
    const fecha = normalizarFecha($(sel).first().attr('content'), ahora)
    if (fecha) return fecha
  }

  // 3 · Microdatos.
  const fechaMeta = normalizarFecha($('meta[itemprop="datePublished"]').first().attr('content'), ahora)
  if (fechaMeta) return fechaMeta
  const fechaTime = normalizarFecha($('time[itemprop="datePublished"]').first().attr('datetime'), ahora)
  if (fechaTime) return fechaTime

  // 4 · Metas de editoriales.
  for (const nombre of METAS_DE_PUBLICACION) {
    const el = $('meta').filter((_, m) => ($(m).attr('name') ?? '').toLowerCase() === nombre).first()
    const fecha = normalizarFecha(el.attr('content'), ahora)
    if (fecha) return fecha
  }

  return null
}

/**
 * La fecha con que se juzga la antiguedad de un articulo: la que declara la
 * pagina si la hay, y si no la del feed o del buscador. La pagina manda porque
 * es la del articulo; la del feed puede ser la de una republicacion o la de
 * cuando el buscador lo volvio a indexar (B3).
 */
export function fechaDelArticulo(
  deLaPagina: string | null | undefined,
  delFeed: string | Date | null | undefined,
): string | null {
  if (deLaPagina) return deLaPagina
  if (delFeed instanceof Date) return isNaN(delFeed.getTime()) ? null : delFeed.toISOString()
  return delFeed || null
}
