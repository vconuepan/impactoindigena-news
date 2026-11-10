/**
 * El candado del build: ninguna pagina se publica horneada sin sus datos.
 *
 * EL DEFECTO (B23). El prerender guarda cada pagina cuando cree que termino de
 * cargar. Si la API publica le respondia 429 —el limite es de 100 consultas cada
 * 15 minutos por IP y un build hacia 204 en dos minutos, medido el 10-nov-2026—,
 * la pagina quedaba en su esqueleto de carga, con el titulo de la portada y sin
 * tarjeta para compartir, y el build lo publicaba en verde. El 7-nov salieron
 * asi nueve de las 16 comunidades, y nadie se entero hasta medirlas a mano.
 *
 * LA PRUEBA. Desde A10 (8-nov) cada ruta prerenderizada pone exactamente un
 * `og:url`, el suyo: las fijas siempre, y los temas y las comunidades solo
 * cuando llegaron sus datos (su Helmet depende de ellos). Asi que «un og:url y
 * es el de la ruta» distingue una pagina horneada bien de una a medio cargar o
 * en su estado de error, sin mirar el contenido de cada una. Lo fija para el
 * fuente `etiquetas-sociales.test.ts`; esto lo comprueba en el HTML horneado.
 *
 * Eso no ve las rutas FIJAS que piden datos (/fuentes, /casos, /comunidades…):
 * su og:url no depende de la API, asi que una de ellas horneada en su estado de
 * error pasaba (hallazgo de la revision del 10-nov-2026). Para esas, la propia
 * pagina deja escrito en `<html>` el atributo `data-prerender-incompleto` cuando
 * alguna de sus consultas termino en error o sin datos (main.tsx, con
 * `consultasIncompletas` de lib/prerender.ts), y aca se lee en todas las rutas.
 *
 * Tambien comprueba que el secreto con que el build se salta el limitador no
 * haya quedado escrito en ninguna pagina.
 *
 * Lo usa `vite.config.ts` en `postProcess`. Es un modulo aparte, sin nada del
 * navegador, para poder probarlo sin compilar.
 */

export interface RutaHorneada {
  route: string
  html: string
}

/** "/issues/x/" -> "/issues/x"; "/" queda "/". */
function normalizar(ruta: string): string {
  let r = ruta
  try {
    r = decodeURIComponent(r)
  } catch {
    // Un escape roto se compara tal cual: no es motivo para tumbar el build.
  }
  return r.length > 1 ? r.replace(/\/+$/, '') : r
}

/** El `content` de cada `<meta property="og:url">`, en cualquier orden de atributos. */
export function ogUrlsDe(html: string): string[] {
  const urls: string[] = []
  for (const etiqueta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bproperty\s*=\s*["']og:url["']/i.test(etiqueta)) continue
    const contenido = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(etiqueta)
    urls.push(contenido ? (contenido[1] ?? contenido[2] ?? '') : '')
  }
  return urls
}

/**
 * El valor de `data-prerender-incompleto` en el `<html>` horneado, o null si la
 * pagina no lo puso. El mismo nombre que `ATRIBUTO_INCOMPLETO` de lib/prerender.ts;
 * no se importa para que este modulo no dependa de nada del navegador (un test
 * fija que coincidan).
 */
export function consultasIncompletasDe(html: string): string | null {
  const etiqueta = /<html\b[^>]*>/i.exec(html)?.[0]
  if (!etiqueta) return null
  const m = /\bdata-prerender-incompleto\s*=\s*"([^"]*)"/i.exec(etiqueta)
  if (!m) return null
  return m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/** Una linea por pagina mal horneada. Vacio = todo bien. */
export function problemasDelHorneado(rutas: RutaHorneada[], opciones: { secreto?: string } = {}): string[] {
  const problemas: string[] = []
  const secreto = opciones.secreto ?? ''

  for (const { route, html } of rutas) {
    if (secreto && html.includes(secreto)) {
      // Nunca se escribe el valor: solo donde aparecio.
      problemas.push(`${route}: el HTML horneado contiene el secreto del prerender (PRERENDER_BYPASS_TOKEN)`)
    }

    const incompletas = consultasIncompletasDe(html)
    if (incompletas !== null) {
      problemas.push(`${route}: se horneo con consultas en error o sin terminar: ${incompletas || '(sin detalle)'}`)
    }

    const urls = ogUrlsDe(html)
    if (urls.length === 0) {
      problemas.push(`${route}: sin og:url, la pagina se horneo sin sus datos (esqueleto o estado de error)`)
      continue
    }
    if (urls.length > 1) {
      problemas.push(`${route}: ${urls.length} og:url, debe haber uno`)
      continue
    }
    let ruta: string
    try {
      ruta = new URL(urls[0]).pathname
    } catch {
      problemas.push(`${route}: og:url no es una URL («${urls[0]}»)`)
      continue
    }
    if (normalizar(ruta) !== normalizar(route)) {
      problemas.push(`${route}: og:url apunta a ${ruta}, no a la pagina`)
    }
  }
  return problemas
}

export interface ResumenApi {
  total: number
  /** Codigo de estado -> cuantas respuestas. */
  porEstado: Record<string, number>
  /** Respuestas que pasaron por el limitador (traian RateLimit-Limit). */
  conLimite: number
}

export function describirResumen(r: ResumenApi): string {
  const estados = Object.entries(r.porEstado)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([estado, n]) => `${estado}×${n}`)
    .join(', ')
  return `${r.total} consultas a la API (${estados || 'ninguna'}); ${r.conLimite} pasaron por el limitador`
}

/**
 * El texto con que falla el build cuando no consigue una de las dos listas
 * (temas o comunidades) que decide que rutas hornear. Sin ellas horneaba solo
 * las rutas fijas y terminaba en verde, y el despliegue, que reemplaza el sitio
 * entero, borraba las paginas de esa lista (medido el 10-nov-2026 con el cupo de
 * la API agotado: las dos listas dieron 429).
 */
export function mensajeSinLista(que: 'temas' | 'comunidades', url: string, motivo: number | string): string {
  const limite = motivo === 429
  return [
    `El build no pudo pedir la lista de ${que} (${url}: ${typeof motivo === 'number' ? `HTTP ${motivo}` : motivo}).`,
    `Sin ella hornearia solo las rutas fijas, y como cada despliegue reemplaza el sitio entero,`,
    `borraria las paginas de ${que} que hoy estan publicadas. Se detiene: produccion queda como estaba.`,
    limite
      ? `Es el limite publico de la API (100 consultas cada 15 min por IP). Con PRERENDER_BYPASS_TOKEN igual en los ` +
        `secretos de GitHub y en el App Service, el build se lo salta. Mientras tanto, volver a correr el workflow pasados 15 minutos.`
      : `Revisar que la API responda: ${url}`,
  ].join('\n')
}

/** El texto con que falla el build: que se rompio, que NO paso y que hacer. */
export function mensajeDelCandado(problemas: string[], resumen: ResumenApi): string {
  const bloqueadas = resumen.porEstado['429'] ?? 0
  const deRed = resumen.porEstado[ESTADO_ERROR_DE_RED] ?? 0
  const caidas = Object.entries(resumen.porEstado)
    .filter(([estado]) => /^5\d\d$/.test(estado))
    .reduce((n, [, c]) => n + c, 0)
  const paginas = new Set(problemas.map((p) => p.slice(0, p.indexOf(':')))).size
  return [
    `El prerender horneo ${paginas} pagina(s) mal. El build se detiene para no publicarlas:`,
    `el sitio en produccion queda como estaba.`,
    ...problemas.map((p) => `  - ${p}`),
    `La API: ${describirResumen(resumen)}.`,
    bloqueadas > 0
      ? `Hubo ${bloqueadas} respuestas 429: el limite publico (100 cada 15 min por IP) se agoto durante el build. ` +
        `Con PRERENDER_BYPASS_TOKEN igual en los secretos de GitHub y en el App Service, el build se lo salta. ` +
        `Mientras tanto, volver a correr el workflow pasados 15 minutos.`
      : deRed + caidas > 0
        ? `Hubo ${caidas} respuestas 5xx y ${deRed} fallas de red: la API no respondio durante el build ` +
          `(por ejemplo, el backend reiniciandose por un despliegue del mismo push). Volver a correr el workflow.`
        : `No hubo respuestas 429 ni 5xx: mirar la pagina en local (PRERENDER_API_URL=https://vocesindigenas.org npm run build --prefix client).`,
  ].join('\n')
}

/** La clave con que el contador anota una peticion que fallo sin respuesta HTTP. */
export const ESTADO_ERROR_DE_RED = 'red'
