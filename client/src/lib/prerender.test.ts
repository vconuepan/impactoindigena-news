import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { estaPrerenderizando } from './prerender'

describe('estaPrerenderizando', () => {
  afterEach(() => {
    delete (window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED
  })

  it('en un navegador normal es false', () => {
    expect(estaPrerenderizando()).toBe(false)
  })

  it('con la marca que inyecta el prerender es true', () => {
    ;(window as unknown as { __PRERENDER_INJECTED?: unknown }).__PRERENDER_INJECTED = { prerender: true }
    expect(estaPrerenderizando()).toBe(true)
  })

  it('el build de verdad inyecta la marca: sin `inject` en vite.config esto nunca seria true', () => {
    // La funcion lee una propiedad que solo existe si el prerender la define.
    // Si alguien quita `inject` de rendererOptions, el respaldo por 404 vuelve
    // a hornearse en el HTML sin que ningun test de componente lo note.
    const vite = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    expect(vite).toMatch(/inject:\s*\{\s*prerender:\s*true\s*\}/)
  })
})
