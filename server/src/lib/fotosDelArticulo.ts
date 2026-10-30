import * as cheerio from 'cheerio'

/**
 * Las fotos del cuerpo del artículo original, además de la og:image.
 *
 * Cada noticia guardaba UNA imagen (`story.imageUrl`, la og:image con que el
 * medio publicó la nota) y el extractor conservaba solo el texto, así que las
 * demás fotos del reportaje se perdían. Pedido del director del 29-oct-2026,
 * el mismo día en que decidió que el carrusel lleva foto solo si es del medio:
 * ver cómo poner más fotos reales con crédito. Esto es la primera mitad: al
 * extraer se capturan las direcciones de las `<img>` del cuerpo; al publicar,
 * `publishStories.ts` las rehospeda en R2 como `ogfoto-<storyId>-NN`
 * (`imageStorage.ts`), y el carrusel las dibuja en las láminas de desarrollo
 * con «Foto: <medio>» (`storyCarouselRender.ts`).
 *
 * Lo que se descarta, y por qué el sesgo es hacia descartar: una foto que
 * falta cuesta una lámina sin foto; un ícono, un avatar o un píxel de
 * rastreo que se cuela sale publicado en Instagram con el crédito del medio.
 *
 * - `data:`, `blob:` y cualquier cosa que no sea http(s).
 * - SVG, GIF, ICO, BMP: logos, animaciones y píxeles, no fotografías.
 * - Rutas que nombran avatares, logos, íconos, botones, publicidad o
 *   medidores de audiencia, y los dominios conocidos de esos servicios.
 * - Un `width` o `height` declarado por debajo del mínimo (300 × 200): el
 *   tamaño real se vuelve a comprobar al rehospedar, cuando se decodifica.
 * - Repetidas: la misma ruta con otra cadena de consulta es la misma foto en
 *   otro tamaño (los CDN la ponen en `?w=`).
 * - La og:image, que ya va en la portada: se pasa en `excluir`.
 */

export const MAX_FOTOS_POR_ARTICULO = 6
export const ANCHO_MINIMO_DECLARADO = 300
export const ALTO_MINIMO_DECLARADO = 200

const EXTENSION_NO_FOTO = /\.(svg|gif|ico|bmp)(?:[?#]|$)/i

const RUTA_NO_FOTO = new RegExp(
  [
    'avatar', 'gravatar', 'logo', 'icon', 'favicon', 'sprite', 'badge', 'button', 'boton',
    'pixel', 'spacer', 'blank', 'loading', 'placeholder', 'emoji', 'smiley',
    '/share', 'sharing', 'widget', '/ads?[/._-]', 'adserver', 'banner',
    'doubleclick', 'googlesyndication', 'google-analytics', 'googletagmanager',
    'facebook\\.com/tr', 'scorecardresearch', 'quantserve', 'chartbeat', 'comscore',
    'wp-content/plugins', 'wp-includes', 'gstatic\\.com', 'rating', 'captcha',
  ].join('|'),
  'i',
)

/** La clave con la que dos direcciones cuentan como la misma foto. */
function claveDe(url: URL): string {
  return `${url.origin}${url.pathname}`.toLowerCase()
}

/** Sin `base`, solo se acepta una direccion absoluta. */
function aUrl(candidata: string | undefined, base?: string): URL | null {
  const src = (candidata ?? '').trim()
  if (!src || /^(data|blob|javascript):/i.test(src)) return null
  try {
    const url = base ? new URL(src, base) : new URL(src)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

/** El candidato más grande de un `srcset` (por descriptor `w`, si lo trae). */
function mayorDelSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined
  let mejor: { url: string; w: number } | null = null
  for (const parte of srcset.split(',')) {
    const [url, desc] = parte.trim().split(/\s+/)
    if (!url) continue
    const w = desc && /^\d+w$/.test(desc) ? parseInt(desc, 10) : 0
    if (!mejor || w > mejor.w) mejor = { url, w }
  }
  return mejor?.url
}

function dimensionDeclarada(valor: string | undefined): number | null {
  if (!valor) return null
  const n = parseInt(valor, 10)
  // «100%» o «auto» no dicen nada del tamaño real.
  return /^\d+(\.\d+)?(px)?$/.test(valor.trim()) && !isNaN(n) ? n : null
}

/**
 * Filtra una lista de direcciones ya resueltas: la usan las tres vías de
 * extracción (el HTML pasa antes por `extraerFotosDelCuerpo`; Diffbot entrega
 * direcciones directamente).
 */
export function depurarFotos(candidatas: string[], excluir: Array<string | null | undefined> = []): string[] {
  const excluidas = new Set<string>()
  for (const e of excluir) {
    const url = aUrl(e ?? undefined)
    if (url) excluidas.add(claveDe(url))
  }
  const vistas = new Set<string>()
  const fotos: string[] = []
  for (const candidata of candidatas) {
    const url = aUrl(candidata)
    if (!url) continue
    const clave = claveDe(url)
    if (vistas.has(clave) || excluidas.has(clave)) continue
    if (EXTENSION_NO_FOTO.test(url.pathname)) continue
    if (RUTA_NO_FOTO.test(url.href)) continue
    vistas.add(clave)
    fotos.push(url.href)
    if (fotos.length >= MAX_FOTOS_POR_ARTICULO) break
  }
  return fotos
}

/**
 * Las direcciones de las `<img>` de un fragmento de HTML (el `content` que
 * devuelve Readability, o el contenedor del selector del feed), en el orden
 * del artículo, resueltas contra `baseUrl` y depuradas.
 */
export function extraerFotosDelCuerpo(
  html: string,
  baseUrl: string,
  excluir: Array<string | null | undefined> = [],
): string[] {
  if (!html) return []
  let $: cheerio.CheerioAPI
  try {
    $ = cheerio.load(html)
  } catch {
    return []
  }
  const candidatas: string[] = []
  $('img').each((_, el) => {
    const attr = (n: string) => $(el).attr(n)
    const ancho = dimensionDeclarada(attr('width'))
    const alto = dimensionDeclarada(attr('height'))
    if ((ancho !== null && ancho < ANCHO_MINIMO_DECLARADO) || (alto !== null && alto < ALTO_MINIMO_DECLARADO)) return
    // Readability ya pasa `data-src` a `src` en lo que entrega; el selector
    // del feed trabaja sobre el HTML crudo y los sitios con carga perezosa
    // dejan en `src` un píxel o nada.
    const src = aUrl(attr('src'), baseUrl)
    const candidata = src && !/^(data|blob):/i.test(attr('src') ?? '')
      ? src.href
      : aUrl(attr('data-src') ?? attr('data-lazy-src') ?? attr('data-original') ?? mayorDelSrcset(attr('srcset') ?? attr('data-srcset')), baseUrl)?.href
    if (candidata) candidatas.push(candidata)
  })
  return depurarFotos(candidatas, excluir)
}
