import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL, SITE_HOST } from '../config'

/**
 * El dominio que redirige no vuelve a las superficies publicas.
 *
 * INVERTIDO EL 25-NOV-2026. Este candado se escribio en septiembre para que
 * `impactoindigena.news` no volviera despues de la mudanza a
 * `vocesindigenas.org`. El 25-nov-2026 el director decidio volver: el medio
 * recupera el nombre Impacto Indigena News y `impactoindigena.news` es otra vez
 * el canonico, con `vocesindigenas.org` redirigiendo. El candado se invierte, no
 * se borra: la leccion es la misma en las dos direcciones — el dominio que
 * redirige no puede aparecer en lo que leen los rastreadores.
 *
 * LO QUE SIGUE ES LA HISTORIA DE SEPTIEMBRE, que explica por que existe.
 *
 * QUE ATAJA ESTE TEST. El rebrand a Voces Indigenas se desplego el 4-sep-2026 y
 * el sitio quedo sirviendo `og:url`, canonicas y `og:site_name` correctos. Pero
 * `og-image.png` —la imagen que ve quien recibe un enlace compartido— es un PNG
 * estatico generado ANTES del rebrand, con el logotipo anterior y
 * `impactoindigena.news` pintado encima. Ninguna variable de entorno corrige un
 * pixel: la imagen siguio mostrando la marca vieja durante dos semanas en la
 * portada, en todas las secciones y en cada pagina que no es una historia,
 * mientras el resto del sitio ya decia Voces Indigenas.
 *
 * La causa de fondo era un default: `SITE_URL` caia en el dominio viejo si
 * nadie pasaba `VITE_SITE_URL`, asi que todo lo que no pasa por el build de
 * Azure —los scripts de este repo, un entorno local— escribia el dominio muerto
 * sin avisar. Eso es lo que estos tests fijan.
 *
 * LO QUE NO CUBRE: lo que esta pintado dentro del PNG. Un test no lee pixeles,
 * asi que en su lugar se comprueba que el generador tome el host de la
 * configuracion y el logotipo vigente — si ambos son correctos, correr
 * `npm run images:og` produce una imagen correcta.
 */

const DOMINIO_VIEJO = 'vocesindigenas.org'
const DOMINIO_CANONICO = 'impactoindigena.news'
const raiz = (...p: string[]) => path.resolve(__dirname, '../..', ...p)
const leer = (p: string) => readFileSync(raiz(p), 'utf8')

/** Quita comentarios de linea y de bloque de un fuente TS/JS. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('el dominio canonico', () => {
  it('es impactoindigena.news aun sin VITE_SITE_URL', () => {
    // El default importa mas que el valor configurado: es el que corre cuando
    // alguien se olvida de la variable.
    expect(SITE_URL).toBe(`https://${DOMINIO_CANONICO}`)
    expect(SITE_HOST).toBe(DOMINIO_CANONICO)
  })

  it('no aparece el dominio viejo en el HTML base', () => {
    // index.html trae los metadatos que lee un rastreador antes de que
    // React monte nada. Si el dominio viejo vuelve aqui, vuelve a todas partes.
    expect(leer('index.html')).not.toContain(DOMINIO_VIEJO)
  })

  it('robots.txt declara los sitemaps en el dominio canonico', () => {
    // Las lineas `Sitemap:` son las unicas URLs absolutas del archivo; los
    // comentarios pueden contar la historia.
    const sitemaps = leer('public/robots.txt')
      .split('\n')
      .filter((l) => l.startsWith('Sitemap:'))
    expect(sitemaps.length).toBeGreaterThan(0)
    for (const linea of sitemaps) {
      expect(linea).toContain(`https://${DOMINIO_CANONICO}/`)
    }
  })

  it('el widget que se incrusta en sitios ajenos apunta al canonico', () => {
    // widget.js vive en paginas de terceros que nadie de aqui vuelve a tocar:
    // si queda con el dominio viejo, queda asi para siempre.
    const widget = sinComentarios(leer('public/widget.js'))
    expect(widget).not.toContain(DOMINIO_VIEJO)
    expect(widget).toContain(`https://${DOMINIO_CANONICO}`)
  })

  it('no aparece la marca anterior en el manifest', () => {
    const manifest = JSON.parse(leer('public/site.webmanifest')) as {
      name: string
      short_name: string
    }
    // `short_name` es lo que se escribe bajo el icono al instalar el sitio en
    // un telefono: decia "Impacto" mientras `name` ya decia Voces Indigenas.
    expect(manifest.name).toBe('Voces Indígenas')
    expect(manifest.short_name).toBe('Voces')
  })
})

describe('la imagen que se ve al compartir un enlace', () => {
  const generador = leer('scripts/generate-og-image.ts')

  it('toma el dominio de la configuracion y no de un literal', () => {
    expect(sinComentarios(generador)).not.toContain(DOMINIO_VIEJO)
    expect(generador).toContain('SITE_HOST')
  })

  it('usa el logotipo vigente', () => {
    // logo-horizontal.png es el de Voces Indigenas. Los otros dos logotipos con
    // texto del repo —logo-text-horizontal.png y logo-text-square.jpg— son de
    // "actually relevant", la marca de dos rebrandings atras: el generador
    // apuntaba a uno de ellos.
    expect(generador).toContain('logo-horizontal.png')
    expect(generador).not.toContain('logo-text-horizontal')
    expect(generador).not.toContain('logo-text-square')
  })
})

describe('los logotipos del repo', () => {
  /*
   * Este proyecto lleva dos rebrandings: «actually relevant» -> Impacto
   * Indigena -> Voces Indigenas. Cada uno dejo archivos que nadie volvio a
   * mirar y que el sitio siguio sirviendo: hasta el 17-sep-2026 seguian
   * publicos el logotipo con «IMPACTO INDIGENA.news» y tres piezas de
   * «actually relevant». No eran inofensivos — el generador de la imagen OG
   * apuntaba a uno de ellos.
   */
  const MUERTOS = [
    'logo-horizontal.svg', // «IMPACTO INDIGENA.news»
    'logo-text-horizontal.png', // actually relevant
    'logo-text-square.jpg', // actually relevant
    'logo-no-text.png', // actually relevant (el simbolo rosa)
  ]

  it.each(MUERTOS)('%s no vuelve al repo', (nombre) => {
    expect(existsSync(raiz('public/images', nombre))).toBe(false)
  })

  it('los que quedan son los de la marca actual', () => {
    // logo-no-text-square.png es el emblema vigente y SI se usa (StoryCard,
    // EmbedPage): se parece de nombre a un huerfano y no lo es.
    for (const vivo of [
      'logo-horizontal.png',
      'logo-horizontal-blanco.png',
      'logo-no-text-square.png',
      'logo-sello.svg',
      'og-image.png',
    ]) {
      expect(existsSync(raiz('public/images', vivo))).toBe(true)
    }
  })
})

describe('los scripts que escriben URLs publicas', () => {
  it('el generador de sitemap no lleva el dominio escrito a mano', () => {
    // Escribe client/public/sitemap.xml. No corre en el build, pero si alguien
    // lo ejecuta, ese archivo compite con la ruta /sitemap.xml del servidor.
    const src = leer('scripts/generate-sitemap.ts')
    expect(sinComentarios(src)).not.toContain(DOMINIO_VIEJO)
    expect(src).toContain('SITE_URL')
  })
})
