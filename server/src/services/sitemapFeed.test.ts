import { describe, it, expect } from 'vitest'
import { itemsDesdeSitemap, separarFiltroSitemap, tipoSitemap, tituloDesdeSlug } from './sitemapFeed.js'

/**
 * Sitemap como fuente para los municipios sin RSS (12-oct-2026). Los casos
 * reproducen la forma real de los dos sitemaps medidos: Ligup (Nueva Imperial,
 * Los Sauces), que le pone la fecha del dia a la portada y a los listados, y
 * WordPress con Yoast (Traiguen), con imagenes por nota.
 */
const AHORA = new Date('2026-10-12T12:00:00Z')
const OPTS = { ahora: AHORA, maxAgeDays: 14, limit: 30, soloPrefijo: null }

function urlset(entradas: Array<[string, string?, string?]>): string {
  const urls = entradas
    .map(([loc, lastmod, img]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${img ? `<image:image><image:loc>${img}</image:loc></image:image>` : ''}</url>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`
}

const LIGUP = urlset([
  ['https://nuevaimperial.cl', '2026-10-11T00:00:00-03:00'],
  ['https://nuevaimperial.cl/noticias', '2026-10-11T00:00:00-03:00'],
  ['https://nuevaimperial.cl/reservas', '2026-10-11T00:00:00-03:00'],
  ['https://nuevaimperial.cl/secciones/turismo', '2026-10-11T00:00:00-03:00'],
  ['https://nuevaimperial.cl/secciones/turismo/rutas', '2026-10-11T00:00:00-03:00'],
  ['https://nuevaimperial.cl/noticias/trafkintu-fortalece-el-encuentro-comunitario-y-la-24694', '2026-10-02T00:00:00-03:00', 'https://cdn.ligup.io/a.jpg'],
  ['https://nuevaimperial.cl/noticias/seminario-de-parentalidad-positiva-entrego-herrami-24696', '2026-10-05T00:00:00-03:00'],
  ['https://nuevaimperial.cl/noticias/embanderamiento-general-de-la-comuna-id-24576', '2026-09-17T00:00:00-03:00'],
  ['https://nuevaimperial.cl/noticias/sin-fecha-24000'],
])

describe('tipoSitemap', () => {
  it('reconoce urlset e indice por la cabecera, y no confunde un RSS', () => {
    expect(tipoSitemap(LIGUP)).toBe('urlset')
    expect(tipoSitemap('<?xml version="1.0"?><sitemapindex xmlns="x"><sitemap><loc>a</loc></sitemap></sitemapindex>')).toBe('indice')
    expect(tipoSitemap('<?xml version="1.0"?><rss version="2.0"><channel><item><title>&lt;urlset&gt;</title></item></channel></rss>')).toBeNull()
    expect(tipoSitemap('<rss><channel>' + 'x'.repeat(3000) + '<urlset></urlset></channel></rss>')).toBeNull()
  })
})

describe('separarFiltroSitemap', () => {
  it('saca el filtro #solo= de la URL que se pide al servidor', () => {
    expect(separarFiltroSitemap('https://nuevaimperial.cl/sitemap.xml#solo=/noticias/')).toEqual({
      fetchUrl: 'https://nuevaimperial.cl/sitemap.xml',
      soloPrefijo: '/noticias/',
    })
    expect(separarFiltroSitemap('https://example.com/rss')).toEqual({ fetchUrl: 'https://example.com/rss', soloPrefijo: null })
  })
})

describe('tituloDesdeSlug', () => {
  it('humaniza el slug y quita el id de Ligup', () => {
    expect(tituloDesdeSlug('https://nuevaimperial.cl/noticias/trafkintu-fortalece-el-encuentro-comunitario-y-la-24694')).toBe(
      'Trafkintu fortalece el encuentro comunitario y la',
    )
    expect(tituloDesdeSlug('https://munilossauces.cl/noticias/embanderamiento-general-de-la-comuna-id-24576')).toBe('Embanderamiento general de la comuna')
    expect(tituloDesdeSlug('https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso/')).toBe('Bases para llamado a concurso')
    expect(tituloDesdeSlug('no es url')).toBe('Untitled')
  })
})

describe('itemsDesdeSitemap', () => {
  it('entrega solo las URL recientes, de la mas nueva a la mas vieja, sin portada ni listados', () => {
    // /secciones/turismo/rutas entra y va primera: Ligup le pone la fecha del dia.
    // Por eso los feeds de Ligup se cargan con #solo=/noticias/ (caso siguiente).
    const items = itemsDesdeSitemap(LIGUP, OPTS)
    expect(items.map((i) => i.url)).toEqual([
      'https://nuevaimperial.cl/secciones/turismo/rutas',
      'https://nuevaimperial.cl/noticias/seminario-de-parentalidad-positiva-entrego-herrami-24696',
      'https://nuevaimperial.cl/noticias/trafkintu-fortalece-el-encuentro-comunitario-y-la-24694',
    ])
    expect(items[2]).toMatchObject({ datePublished: '2026-10-02T03:00:00.000Z', imageUrl: 'https://cdn.ligup.io/a.jpg', description: null })
  })

  it('con #solo= deja solo esa ruta', () => {
    const items = itemsDesdeSitemap(LIGUP, { ...OPTS, soloPrefijo: '/noticias/' })
    expect(items.map((i) => new URL(i.url).pathname.split('/')[1])).toEqual(['noticias', 'noticias'])
  })

  it('la ventana deja fuera lo viejo; 0 la quita', () => {
    expect(itemsDesdeSitemap(LIGUP, { ...OPTS, soloPrefijo: '/noticias/' })).toHaveLength(2)
    expect(itemsDesdeSitemap(LIGUP, { ...OPTS, soloPrefijo: '/noticias/', maxAgeDays: 0 })).toHaveLength(3)
  })

  it('respeta el tope de items', () => {
    expect(itemsDesdeSitemap(LIGUP, { ...OPTS, limit: 1 })).toHaveLength(1)
  })

  it('ignora entradas sin lastmod, con fecha invalida o con loc invalida', () => {
    const xml = urlset([
      ['https://a.cl/noticias/x-1', 'no-es-fecha'],
      ['no-es-url/noticias/y', '2026-10-10'],
      ['https://a.cl/noticias/z-2'],
      ['https://a.cl/noticias/ok-3', '2026-10-10'],
    ])
    expect(itemsDesdeSitemap(xml, OPTS).map((i) => i.url)).toEqual(['https://a.cl/noticias/ok-3'])
  })

  it('WordPress (Traiguen): las URL con barra final no se toman por listado de si mismas', () => {
    const xml = urlset([
      ['https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/', '2026-10-01T12:04:54+00:00', 'https://mtraiguen.cl/i.png'],
      ['https://mtraiguen.cl/municipalidad/inicio-de-las-obras/', '2026-06-02T17:32:23+00:00'],
    ])
    const items = itemsDesdeSitemap(xml, OPTS)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ title: 'Bases para llamado a concurso publico de 3 cargos', imageUrl: 'https://mtraiguen.cl/i.png' })
  })
})
