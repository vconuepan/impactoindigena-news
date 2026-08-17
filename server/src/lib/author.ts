/**
 * author.ts — extraccion y limpieza del autor del articulo original.
 *
 * POR QUE EXISTE. El art. 71 B de la Ley 17.336 es la unica norma que ampara
 * lo que hace este medio: permite incluir "fragmentos breves de obra
 * protegida, que haya sido licitamente divulgada … a titulo de cita",
 * **"siempre que se mencione su fuente, titulo y autor"**. Verificado el
 * 17-ago-2026 contra el XML oficial de LeyChile (idNorma 28933). Chile NO
 * tiene una excepcion separada para prensa o informacion de actualidad —se
 * buscaron "prensa", "actualidad", "noticias del dia"— asi que esa cuarta
 * condicion no es decorativa. Hasta hoy el autor ni siquiera se capturaba.
 *
 * QUE TAN SEGUIDO VIENE. Medido sobre los 25 dominios mas crawleados: **17
 * publican autor detectable** en meta tags o JSON-LD, 8 no. Cuando no viene,
 * `null` es la respuesta correcta: la ley obliga a mencionarlo, no a
 * inventarlo, y la ficha muestra entonces fuente y titulo.
 *
 * POR QUE HAY QUE LIMPIARLO. Lo que devuelven los sitios viene sucio, y estos
 * son casos reales de la medicion:
 *
 *   infobae.com      article:author = "https://www.infobae.com/autor/fabricio…"
 *   elmostrador.cl   article:author = "https://www.facebook.com/elmostrador/"
 *   telesurtv.net    json-ld        = "Javier Due\\u00f1as"
 *   rnz.co.nz        meta author    = "RNZ | Te Reo Irirangi o Aotearoa"
 *
 * Una URL no es un autor y publicarla como tal seria peor que no publicar
 * nada. Un nombre de redaccion ("Alberta Native News Staff") si lo es, y se
 * conserva: la ley pide mencionar al autor, y a veces el autor es el medio.
 */

/** Patrones ordenados por fiabilidad; el primero que da un valor limpio gana. */
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'json-ld', re: /"author"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]{2,120})"/i },
  { name: 'meta-author', re: /<meta[^>]+name=["']author["'][^>]+content=["']([^"']{2,120})["']/i },
  { name: 'meta-author-rev', re: /<meta[^>]+content=["']([^"']{2,120})["'][^>]+name=["']author["']/i },
  { name: 'article:author', re: /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']{2,120})["']/i },
  { name: 'json-ld-flat', re: /"author"\s*:\s*"([^"]{2,120})"/i },
  { name: 'itemprop', re: /itemprop=["']author["'][^>]*>\s*([^<]{2,120})</i },
]

/** Prefijos de firma que no son parte del nombre. */
const BYLINE_PREFIX = /^\s*(?:by|por|escrito por|redacci[oó]n de|autor[ae]?:)\s+/i

/**
 * Limpia un valor crudo y devuelve el nombre, o null si no sirve.
 *
 * Rechaza URLs y correos: son lo que mas devuelven los sitios en
 * `article:author`, y ninguno es un nombre que se pueda publicar como firma.
 */
export function normalizeAuthor(raw: string | null | undefined): string | null {
  if (!raw) return null

  let value = raw
    // JSON-LD suele venir con los escapes sin resolver.
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()

  value = value.replace(BYLINE_PREFIX, '').trim()
  // Separadores de cierre que arrastran el nombre del medio: "Autor | Medio".
  value = value.split(/\s+[|·—–]\s+/)[0].trim()
  value = value.replace(/[,;:.\s]+$/, '').trim()

  if (value.length < 2 || value.length > 120) return null
  if (/^https?:\/\//i.test(value)) return null           // URL, no autor
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) return null // correo
  if (!/\p{L}/u.test(value)) return null                 // sin una sola letra

  return value
}

/**
 * Busca el autor en el HTML de la pagina.
 *
 * Recorre los patrones en orden y devuelve el primero que sobrevive a la
 * limpieza. Que un patron encuentre basura (una URL de Facebook) no descarta
 * el articulo: se sigue con el siguiente patron.
 */
export function extractAuthorFromHtml(html: string | null | undefined): string | null {
  if (!html) return null
  for (const { re } of PATTERNS) {
    const match = html.match(re)
    if (!match) continue
    const cleaned = normalizeAuthor(match[1])
    if (cleaned) return cleaned
  }
  return null
}
