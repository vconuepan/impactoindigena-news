import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ogUrlsDe, problemasDelHorneado, mensajeDelCandado, mensajeSinLista, describirResumen } from './verificar-horneado'

const SITIO = 'https://vocesindigenas.org'
const pagina = (ogUrl?: string, extra = '') =>
  `<!DOCTYPE html><html lang="es"><head><title>x</title>${
    ogUrl === undefined ? '' : `<meta property="og:url" content="${ogUrl}" data-rh="true">`
  }${extra}</head><body></body></html>`

describe('ogUrlsDe', () => {
  it('lee el og:url con los atributos en cualquier orden y comillas simples o dobles', () => {
    expect(ogUrlsDe(`<meta property="og:url" content="${SITIO}/a">`)).toEqual([`${SITIO}/a`])
    expect(ogUrlsDe(`<meta data-rh="true" content="${SITIO}/b" property="og:url">`)).toEqual([`${SITIO}/b`])
    expect(ogUrlsDe(`<meta property='og:url' content='${SITIO}/c'>`)).toEqual([`${SITIO}/c`])
  })

  it('no confunde og:url con otras etiquetas', () => {
    expect(ogUrlsDe(`<meta property="og:title" content="t"><link rel="canonical" href="${SITIO}/a">`)).toEqual([])
  })
})

describe('problemasDelHorneado (B23)', () => {
  it('una pagina con su og:url pasa, con o sin barra final', () => {
    expect(problemasDelHorneado([
      { route: '/', html: pagina(`${SITIO}/`) },
      { route: '/comunidad/aymara', html: pagina(`${SITIO}/comunidad/aymara`) },
      { route: '/issues/x/', html: pagina(`${SITIO}/issues/x`) },
    ])).toEqual([])
  })

  it('la comunidad horneada en esqueleto (sin og:url) se detecta: es el defecto del 7-nov', () => {
    const p = problemasDelHorneado([{ route: '/comunidad/patagonia', html: pagina() }])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/^\/comunidad\/patagonia: sin og:url/)
  })

  it('una pagina con el og:url de otra ruta (la portada) se detecta', () => {
    const p = problemasDelHorneado([{ route: '/casos', html: pagina(`${SITIO}/`) }])
    expect(p[0]).toMatch(/og:url apunta a \/, no a la pagina/)
  })

  it('dos og:url se detectan: es el defecto que A10 saco de index.html', () => {
    const html = pagina(`${SITIO}/about`, `<meta property="og:url" content="${SITIO}/">`)
    expect(problemasDelHorneado([{ route: '/about', html }])[0]).toMatch(/2 og:url/)
  })

  it('el dominio no importa: compara la ruta, asi sirve en local y en produccion', () => {
    expect(problemasDelHorneado([{ route: '/about', html: pagina('http://localhost:5173/about') }])).toEqual([])
  })

  it('el secreto escrito en una pagina se detecta sin repetir su valor', () => {
    const secreto = 's'.repeat(40)
    const p = problemasDelHorneado(
      [{ route: '/about', html: pagina(`${SITIO}/about`, `<script>window.x="${secreto}"</script>`) }],
      { secreto },
    )
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/contiene el secreto/)
    expect(p[0]).not.toContain(secreto)
  })

  it('una ruta fija con su og:url pero con una consulta en error se detecta (revision del 10-nov-2026)', () => {
    const html = pagina(`${SITIO}/casos`).replace('<html lang="es">', '<html lang="es" data-prerender-incompleto="[&quot;cases&quot;] (error)">')
    const p = problemasDelHorneado([{ route: '/casos', html }])
    expect(p).toEqual(['/casos: se horneo con consultas en error o sin terminar: ["cases"] (error)'])
  })

  it('el atributo solo cuenta en <html>, no si aparece como texto en el cuerpo', () => {
    const html = pagina(`${SITIO}/glosario`).replace('<body>', '<body><p>data-prerender-incompleto="x"</p>')
    expect(problemasDelHorneado([{ route: '/glosario', html }])).toEqual([])
  })

  it('sin secreto configurado no busca nada (un vacio estaria en todas)', () => {
    expect(problemasDelHorneado([{ route: '/about', html: pagina(`${SITIO}/about`) }], { secreto: '' })).toEqual([])
  })
})

describe('mensajeDelCandado', () => {
  it('con 429 nombra el limite y que hacer', () => {
    const m = mensajeDelCandado(['/comunidad/a: sin og:url'], { total: 204, porEstado: { '200': 99, '429': 105 }, conLimite: 204 })
    expect(m).toMatch(/queda como estaba/)
    expect(m).toMatch(/105 respuestas 429/)
    expect(m).toMatch(/PRERENDER_BYPASS_TOKEN/)
  })

  it('cuenta paginas, no lineas: una pagina con dos problemas es una', () => {
    const m = mensajeDelCandado(['/a: sin og:url', '/a: se horneo con consultas en error', '/b: sin og:url'], { total: 1, porEstado: {}, conLimite: 0 })
    expect(m).toMatch(/^El prerender horneo 2 pagina\(s\) mal/)
  })

  it('con 5xx o fallas de red apunta a la API caida, no a la pagina', () => {
    const m = mensajeDelCandado(['/x: sin og:url'], { total: 5, porEstado: { '200': 2, '502': 2, red: 1 }, conLimite: 2 })
    expect(m).toMatch(/2 respuestas 5xx y 1 fallas de red/)
    expect(m).not.toMatch(/mirar la pagina en local/)
  })

  it('sin 429 no culpa al limite', () => {
    const m = mensajeDelCandado(['/x: sin og:url'], { total: 10, porEstado: { '200': 10 }, conLimite: 10 })
    expect(m).toMatch(/No hubo respuestas 429/)
    expect(m).not.toMatch(/se agoto/)
    expect(m).not.toMatch(/PRERENDER_BYPASS_TOKEN/)
  })

  it('describirResumen ordena los estados', () => {
    expect(describirResumen({ total: 3, porEstado: { '429': 1, '200': 2 }, conLimite: 0 })).toBe(
      '3 consultas a la API (200×2, 429×1); 0 pasaron por el limitador',
    )
  })
})

describe('mensajeSinLista', () => {
  it('con 429 dice que borraria las paginas, que produccion queda como estaba y que hacer', () => {
    const m = mensajeSinLista('comunidades', 'http://x/api/communities', 429)
    expect(m).toMatch(/HTTP 429/)
    expect(m).toMatch(/borraria las paginas de comunidades/)
    expect(m).toMatch(/queda como estaba/)
    expect(m).toMatch(/PRERENDER_BYPASS_TOKEN/)
  })

  it('con otro motivo no culpa al limite', () => {
    const m = mensajeSinLista('temas', 'http://x/api/issues', 'lista vacia')
    expect(m).toMatch(/lista vacia/)
    expect(m).not.toMatch(/PRERENDER_BYPASS_TOKEN/)
  })
})

describe('vite.config usa el candado', () => {
  it('una lista fallida detiene el build en vez de saltarse sus paginas (10-nov-2026)', () => {
    const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    expect(vite).toMatch(/pedirListaODetener<[^>]+>\('temas'/)
    expect(vite).toMatch(/pedirListaODetener<[^>]+>\('comunidades'/)
    expect(vite).toMatch(/if \(!res\.ok\) throw new Error\(mensajeSinLista\(que, url, res\.status\)\)/)
    // El salto silencioso de antes: `if (!res.ok) return []`.
    expect(vite).not.toMatch(/if \(!res\.ok\) return \[\]/)
  })

  it('una lista VACIA con HTTP 200 no detiene el build: desactivar todas las comunidades es un dato', () => {
    const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    expect(vite).not.toMatch(/mensajeSinLista\([^)]*'lista vacia'\)/)
  })

  it('el build exige el mismo largo minimo del secreto que el servidor', () => {
    const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    const servidor = readFileSync(path.resolve(__dirname, '../../../server/src/lib/prerenderBypass.ts'), 'utf8')
    const enCliente = /const LARGO_MINIMO_SECRETO = (\d+)/.exec(vite)?.[1]
    const enServidor = /export const LARGO_MINIMO = (\d+)/.exec(servidor)?.[1]
    expect(enCliente).toBeDefined()
    expect(enCliente).toBe(enServidor)
  })

  const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')

  it('llama a problemasDelHorneado en postProcess y detiene el build con un error', () => {
    // Si alguien lo saca, las paginas vacias vuelven a publicarse en verde.
    expect(vite).toMatch(/problemasDelHorneado\(/)
    expect(vite).toMatch(/throw new Error\(mensajeDelCandado\(/)
  })

  it('un secreto con saltos de linea o espacios detiene el build antes de usarlo', () => {
    // `fetch` copia el valor entero en su error si el encabezado es invalido.
    expect(vite).toMatch(/\^\[\\x21-\\x7E\]\+\$/)
  })

  it('el proxy cuenta las fallas de red, no solo las respuestas', () => {
    expect(vite).toMatch(/onError:/)
  })

  it('el secreto no viaja a la pagina: no esta en `inject`', () => {
    expect(vite).toMatch(/inject:\s*\{\s*prerender:\s*true\s*\}/)
  })
})
