import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { esFallaDeChunk, instalarRecargaPorVersion, recargarUnaVez, VENTANA_MS } from './recarga-por-version'

/**
 * Un despliegue borra los chunks anteriores (6-oct-2026). La pestaña abierta se
 * recarga sola una vez; si vuelve a fallar dentro de la ventana, no insiste.
 */
function almacen() {
  const datos = new Map<string, string>()
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) }
}

describe('esFallaDeChunk', () => {
  it('reconoce los mensajes de Chrome, Firefox, Safari y Vite', () => {
    for (const m of [
      'Failed to fetch dynamically imported module: https://vocesindigenas.org/assets/ReviewsPage-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/AdminLayout-x.css',
    ]) {
      expect(esFallaDeChunk(new Error(m)), m).toBe(true)
    }
  })

  it('no confunde otros errores con una falla de chunk', () => {
    expect(esFallaDeChunk(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(esFallaDeChunk(new TypeError('Failed to fetch'))).toBe(false)
    expect(esFallaDeChunk(null)).toBe(false)
  })
})

describe('recargarUnaVez', () => {
  it('recarga la primera vez y no otra vez dentro de la ventana', () => {
    const storage = almacen()
    const recargar = vi.fn()
    expect(recargarUnaVez({ storage, recargar, ahora: 1_000_000, enLinea: true })).toBe(true)
    expect(recargarUnaVez({ storage, recargar, ahora: 1_000_000 + VENTANA_MS - 1, enLinea: true })).toBe(false)
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('pasada la ventana, vuelve a recargar', () => {
    const storage = almacen()
    const recargar = vi.fn()
    recargarUnaVez({ storage, recargar, ahora: 1_000_000, enLinea: true })
    expect(recargarUnaVez({ storage, recargar, ahora: 1_000_000 + VENTANA_MS, enLinea: true })).toBe(true)
    expect(recargar).toHaveBeenCalledTimes(2)
  })

  it('sin almacenamiento, o si falla, no recarga: no habría cómo cortar un bucle', () => {
    const recargar = vi.fn()
    expect(recargarUnaVez({ storage: null, recargar, ahora: 1, enLinea: true })).toBe(false)
    const roto = { getItem: () => { throw new Error('SecurityError') }, setItem: () => {} }
    expect(recargarUnaVez({ storage: roto, recargar, ahora: 1, enLinea: true })).toBe(false)
    expect(recargar).not.toHaveBeenCalled()
  })

  it('sin red no recarga: un import tambien falla sin conexion, y la recarga dejaria la pagina de error del navegador', () => {
    const storage = almacen()
    const recargar = vi.fn()
    // Fuera de la ventana a proposito: que lo que corte sea la red, no el tiempo.
    expect(recargarUnaVez({ storage, recargar, ahora: 1_000_000, enLinea: false })).toBe(false)
    expect(recargar).not.toHaveBeenCalled()
    expect(storage.getItem('recarga-por-version')).toBeNull()
  })
})

describe('instalarRecargaPorVersion', () => {
  it('ante vite:preloadError recarga y cancela el error', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
    window.sessionStorage.clear()
    instalarRecargaPorVersion()
    const evento = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(evento)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(evento.defaultPrevented).toBe(true)
  })

  it('main.tsx lo instala al arrancar', () => {
    const main = readFileSync(path.resolve(__dirname, '../main.tsx'), 'utf8')
    expect(main).toMatch(/^instalarRecargaPorVersion\(\)/m)
  })
})
