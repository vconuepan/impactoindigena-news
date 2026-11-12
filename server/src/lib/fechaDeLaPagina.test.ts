import { describe, it, expect } from 'vitest'
import { fechaDeclaradaEnLaPagina, fechaDelArticulo, normalizarFecha } from './fechaDeLaPagina.js'

/**
 * Los dos casos del B3 (traspaso de otras-voces, 11-nov-2026), con la ESTRUCTURA
 * de metadatos que cada pagina tenia ese dia, leida con el User-Agent del
 * rastreador. Sin el texto de las notas: solo las etiquetas que llevan fecha.
 *
 *  - Kaos en la Red: `article:published_time` y `itemprop="datePublished"`, sin
 *    JSON-LD de articulo. Declara el 10-oct-2026 y es una nota de ese dia (un
 *    operativo del jueves 8): NO era vieja, el 2023 era el origen del juicio.
 *  - Pagina/12 (787279): solo JSON-LD, una lista con Organization,
 *    BreadcrumbList y NewsArticle. El NewsArticle declara 2025-10-26; la pagina
 *    muestra a la vista «03 de diciembre de 2024», que no se lee.
 */

const AHORA = new Date('2026-10-06T19:00:05Z') // cuando entro la de Pagina/12

const KAOS = `<!DOCTYPE html><html><head>
<meta property="og:type" content="article" />
<meta property="article:published_time" content="2026-10-10T07:02:11+02:00"/>
<meta property="article:modified_time" content="2026-10-10T04:10:07+02:00" />
<meta property="og:updated_time" content="2026-10-10T04:10:07+02:00" />
<meta itemprop="datePublished" content="2026-10-10"/>
<meta itemprop="dateModified" content="2026-10-10T04:10:07+02:00" />
</head><body><article><p>Texto de la nota.</p></article></body></html>`

const PAGINA12 = `<!DOCTYPE html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Medio","foundingDate":"1987-05-26"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"Titular","datePublished":"2025-10-26T22:29:21.376Z","dateModified":"2025-10-26T22:29:21.376Z","mainEntityOfPage":{"@type":"WebPage"}}</script>
</head><body><span class="fecha">03 de diciembre de 2024</span><p>Texto de la nota.</p></body></html>`

describe('fechaDeclaradaEnLaPagina · los dos casos del B3', () => {
  it('Kaos en la Red: lee article:published_time, la de publicacion y no la de modificacion', () => {
    expect(fechaDeclaradaEnLaPagina(KAOS, new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-10T05:02:11.000Z')
  })

  it('Pagina/12: lee el datePublished del NewsArticle, no del Organization ni del Breadcrumb', () => {
    expect(fechaDeclaradaEnLaPagina(PAGINA12, AHORA)).toBe('2025-10-26T22:29:21.376Z')
  })
})

describe('fechaDeclaradaEnLaPagina · las demas formas', () => {
  it('JSON-LD dentro de @graph (Yoast, WordPress)', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite","datePublished":"2010-01-01"},{"@type":["Article","NewsArticle"],"datePublished":"2026-09-01T10:00:00-03:00"}]}</script>`
    expect(fechaDeclaradaEnLaPagina(html, AHORA)).toBe('2026-09-01T13:00:00.000Z')
  })

  it('un JSON-LD roto no impide leer las metas', () => {
    const html = `<script type="application/ld+json">{ roto </script><meta property="article:published_time" content="2026-09-02T00:00:00Z">`
    expect(fechaDeclaradaEnLaPagina(html, AHORA)).toBe('2026-09-02T00:00:00.000Z')
  })

  it('el JSON-LD de un sitio (Organization, WebSite) no da fecha de articulo', () => {
    const html = `<script type="application/ld+json">{"@type":"WebSite","datePublished":"2011-05-02"}</script>`
    expect(fechaDeclaradaEnLaPagina(html, AHORA)).toBeNull()
  })

  it('<time itemprop="datePublished"> y las metas de editoriales', () => {
    expect(fechaDeclaradaEnLaPagina(`<time itemprop="datePublished" datetime="2026-08-30">30 ago</time>`, AHORA)).toBe('2026-08-30T00:00:00.000Z')
    expect(fechaDeclaradaEnLaPagina(`<meta name="parsely-pub-date" content="2026-08-29T12:00:00Z">`, AHORA)).toBe('2026-08-29T12:00:00.000Z')
    expect(fechaDeclaradaEnLaPagina(`<meta name="DC.date.issued" content="2026-08-28">`, AHORA)).toBe('2026-08-28T00:00:00.000Z')
  })

  it('una fecha futura o absurda se salta y se usa la siguiente', () => {
    const html = `<meta property="article:published_time" content="2031-01-01T00:00:00Z"><meta itemprop="datePublished" content="2026-09-03">`
    expect(fechaDeclaradaEnLaPagina(html, AHORA)).toBe('2026-09-03T00:00:00.000Z')
    expect(normalizarFecha('1970-01-01', AHORA)).toBeNull()
    expect(normalizarFecha('mañana', AHORA)).toBeNull()
  })

  it('sin fecha declarada, null: no se inventa', () => {
    expect(fechaDeclaradaEnLaPagina('<html><head><title>x</title></head><body>03 de diciembre de 2024</body></html>', AHORA)).toBeNull()
    expect(fechaDeclaradaEnLaPagina('', AHORA)).toBeNull()
  })
})

describe('fechaDelArticulo: la pagina manda sobre el feed', () => {
  it('con las dos, la de la pagina', () => {
    expect(fechaDelArticulo('2025-10-26T22:29:21.376Z', '2026-10-06T10:00:00Z')).toBe('2025-10-26T22:29:21.376Z')
  })

  it('sin la de la pagina, la del feed o del buscador (texto o Date)', () => {
    expect(fechaDelArticulo(null, '2026-10-06T10:00:00Z')).toBe('2026-10-06T10:00:00Z')
    expect(fechaDelArticulo(null, new Date('2026-10-06T10:00:00Z'))).toBe('2026-10-06T10:00:00.000Z')
    expect(fechaDelArticulo(undefined, null)).toBeNull()
  })
})
