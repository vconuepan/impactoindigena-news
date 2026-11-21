import { describe, it, expect } from 'vitest'
import { puntuar, categoriaDe, type Senales } from './puntajeLector.js'
import { coherenciaIdioma, tipoDePagina } from './senalesVisitante.js'

const base: Senales = {
  interactuo: false, nube: '', origen: '', idioma: 'sin_dato', dispositivo: 'desktop',
  paginas: 1, vioFicha: false, vioBusqueda: false, vioOtra: false,
}
const s = (o: Partial<Senales>): Senales => ({ ...base, ...o })

// Los casos de docs/propuesta-analytics-bots.md (fase 3, A).
describe('puntuar: los casos de la propuesta', () => {
  it.each<[string, Partial<Senales>, number, string]>([
    ['director en Santiago, celular, es-CL, 2 fichas, scroll',
      { interactuo: true, idioma: 'coherente', dispositivo: 'mobile', paginas: 2, vioFicha: true }, 95, 'lector'],
    ['el mismo con VPN corporativa (IP de nube), en computador',
      { interactuo: true, nube: 'Amazon AWS', idioma: 'coherente', paginas: 2, vioFicha: true }, 70, 'lector'],
    ['lectora en México desde Google, una ficha, se va en 3 s',
      { origen: 'search', idioma: 'coherente', vioFicha: true }, 75, 'lector'],
    ['Chrome desde Alibaba, zh-CN, solo /search con un titular',
      { nube: 'Alibaba Cloud', idioma: 'incoherente', vioBusqueda: true }, 0, 'bot'],
    ['Chrome desde Alibaba, zh-CN, una ficha, sin interacción',
      { nube: 'Alibaba Cloud', idioma: 'incoherente', vioFicha: true }, 25, 'bot'],
    ['Chrome desde AWS, en-US, una ficha, sin interacción',
      { nube: 'Amazon AWS', idioma: 'coherente', vioFicha: true }, 45, 'dudoso'],
    ['navegador residencial en Alemania, de-DE, solo /search, sin interacción',
      { idioma: 'incoherente', vioBusqueda: true }, 20, 'bot'],
    ['lector real que abre una ficha y se va sin tocar nada',
      { idioma: 'coherente', vioFicha: true }, 65, 'dudoso'],
    ['headless sin idioma desde AWS, una ficha',
      { nube: 'Amazon AWS', vioFicha: true }, 35, 'dudoso'],
  ])('%s → %i (%s)', (_, o, puntaje, categoria) => {
    const r = puntuar(s(o))
    expect(r.puntaje).toBe(puntaje)
    expect(r.categoria).toBe(categoria)
  })

  it('más de 200 páginas en el día desde la misma IP resta, aunque interactúe', () => {
    const r = puntuar(s({ nube: 'Hetzner', paginas: 500, vioFicha: true, idioma: 'incoherente' }))
    expect(r.categoria).toBe('bot')
    expect(r.motivos.join(' ')).toContain('ritmo de máquina (500 páginas en el día)')
  })
})

describe('puntuar: ninguna señal decide sola', () => {
  // Desde un visitante neutro (sin interaccion: −5; red no de nube: +5 → 50),
  // cambiar UNA señal no cruza ningun umbral.
  const neutro = s({})
  it('el punto de partida neutro es 50', () => {
    expect(puntuar(neutro).puntaje).toBe(50)
  })
  it.each<[string, Partial<Senales>]>([
    ['interacción', { interactuo: true }],
    ['origen de búsqueda', { origen: 'search' }],
    ['idioma coherente', { idioma: 'coherente' }],
    ['móvil', { dispositivo: 'mobile' }],
    ['dos páginas', { paginas: 2 }],
    ['red de nube', { nube: 'Amazon AWS' }],
    ['idioma incoherente', { idioma: 'incoherente' }],
    ['solo búsqueda', { vioBusqueda: true }],
    ['ritmo de máquina', { paginas: 300 }],
  ])('%s sola queda en «dudoso»', (_, o) => {
    expect(puntuar(s(o)).categoria).toBe('dudoso')
  })
})

describe('puntuar: motivos y límites', () => {
  it('los motivos dicen qué sumó y qué restó', () => {
    expect(puntuar(s({ nube: 'Tencent Cloud' })).motivos).toEqual(['−5 sin interacción', '−15 red de nube (Tencent Cloud)'])
  })
  it('el puntaje se acota entre 0 y 100', () => {
    expect(categoriaDe(70)).toBe('lector')
    expect(categoriaDe(69)).toBe('dudoso')
    expect(categoriaDe(30)).toBe('dudoso')
    expect(categoriaDe(29)).toBe('bot')
  })
})

describe('coherenciaIdioma', () => {
  it.each([
    ['es-CL,es;q=0.9,en;q=0.8', 'coherente'],
    ['pt-BR', 'coherente'],
    ['en-US,en;q=0.9', 'coherente'],
    ['qu-PE', 'coherente'],
    ['arn', 'coherente'],
    ['zh-CN,zh;q=0.9', 'incoherente'],
    ['de-DE', 'incoherente'],
    ['', 'sin_dato'],
    [undefined, 'sin_dato'],
    ['*', 'sin_dato'],
  ])('%s → %s', (h, esperado) => {
    expect(coherenciaIdioma(h as string | undefined)).toBe(esperado)
  })
})

describe('tipoDePagina', () => {
  it.each([
    ['/stories/una-nota', 'ficha'],
    ['/en/stories/a-story', 'ficha'],
    ['/search', 'busqueda'],
    ['/', 'otra'],
    ['/issues/chile-indigena', 'otra'],
  ])('%s → %s', (p, t) => {
    expect(tipoDePagina(p)).toBe(t)
  })
})
