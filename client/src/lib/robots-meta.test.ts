import { describe, it, expect } from 'vitest'
import { unaSolaMetaRobots } from './robots-meta'

const DEL_SITIO = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />'
const DE_PAGINA = '<meta name="robots" content="noindex, follow" data-rh="true">'

const robots = (html: string) => html.match(/<meta[^>]*name="robots"[^>]*>/g) ?? []

describe('unaSolaMetaRobots', () => {
  // El HTML de /search medido en vivo el 20-nov-2026 traia las dos.
  it('si la pagina fijo la suya, borra la generica del sitio', () => {
    const html = `<head>\n${DEL_SITIO}\n<title>x</title>${DE_PAGINA}</head>`
    const out = unaSolaMetaRobots(html)
    expect(robots(out)).toEqual([DE_PAGINA])
    expect(out).toContain('<title>x</title>')
  })

  it('sin etiqueta de pagina, deja la del sitio tal cual', () => {
    const html = `<head>${DEL_SITIO}<title>x</title></head>`
    expect(unaSolaMetaRobots(html)).toBe(html)
  })

  it('sin ninguna etiqueta robots, no toca nada', () => {
    const html = '<head><title>x</title></head>'
    expect(unaSolaMetaRobots(html)).toBe(html)
  })

  it('no confunde otras metaetiquetas', () => {
    const otra = '<meta name="googlebot" content="index">'
    const html = `<head>${DEL_SITIO}${otra}${DE_PAGINA}</head>`
    const out = unaSolaMetaRobots(html)
    expect(out).toContain(otra)
    expect(robots(out)).toEqual([DE_PAGINA])
  })

  it('reconoce el atributo name en cualquier orden y con comillas simples', () => {
    const html = `<head><meta content='index, follow' name='robots'>${DE_PAGINA}</head>`
    expect(robots(unaSolaMetaRobots(html))).toEqual([DE_PAGINA])
  })
})
