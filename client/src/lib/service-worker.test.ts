import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * El sitio NO registra un service worker, y hay motivo.
 *
 * Entre el 15-mar-2026 y el 2-ago-2026 si lo hacia, y ese worker aplicaba
 * `cache-first` a todo lo que no fuera HTML, fuentes o imagenes — incluidos los
 * GET del propio origen. `/api/stats/daily` y `/api/spotlight` quedaban
 * servidos desde cache **sin revalidar nunca**, congelados en la primera
 * respuesta que el lector recibio.
 *
 * `public/sw.js` es hoy un worker de retirada: se desinstala y borra esas
 * caches. Volver a registrar uno sin arreglar antes la regla de `/api/`
 * reviviria el defecto, y en un lugar dificil de revertir: un service worker
 * vive en el navegador del lector, no en el servidor.
 */

const raiz = path.resolve(__dirname, '../..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')

describe('el service worker está retirado, y a propósito', () => {
  it('index.html no registra ningun service worker', () => {
    const html = leer('index.html')
    expect(
      html,
      'volviste a registrar un service worker: lee public/sw.js antes, explica por que se retiro',
    ).not.toMatch(/serviceWorker\s*\.\s*register/)
  })

  it('sw.js sigue existiendo: es lo que desinstala al worker viejo', () => {
    // Si empieza a dar 404, deja de estar garantizado que el worker de marzo se
    // retire de los navegadores que aun lo tienen.
    expect(() => leer('public/sw.js')).not.toThrow()
  })

  it('sw.js se desinstala y limpia, en vez de cachear', () => {
    const sw = leer('public/sw.js')
    expect(sw).toContain('registration.unregister()')
    expect(sw).toContain('caches.delete')
  })

  it('sw.js no intercepta peticiones', () => {
    // Sin handler de `fetch` no puede servir nada desde cache. Es lo que hace
    // que la red vuelva a mandar en cuanto se activa.
    const sw = leer('public/sw.js')
    expect(sw, 'un worker de retirada no debe tener handler de fetch').not.toMatch(
      /addEventListener\(\s*['"]fetch['"]/,
    )
  })
})
