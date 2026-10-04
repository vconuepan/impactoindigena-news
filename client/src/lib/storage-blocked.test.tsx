import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthProvider } from './auth'
import { hasSetPreferences } from './preferences'

/**
 * Con el almacenamiento bloqueado, leer `window.localStorage` lanza
 * SecurityError. Pasa con cookies de terceros bloqueadas, por ejemplo dentro
 * del iframe de /embed en el sitio de otra organizacion. Hasta el 4-oct-2026
 * AuthProvider, que envuelve TODA la aplicacion, lo leia sin try y la pagina
 * quedaba en blanco.
 */
const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!

function bloquearAlmacenamiento() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
}

afterEach(() => {
  Object.defineProperty(window, 'localStorage', original)
  vi.restoreAllMocks()
})

describe('almacenamiento bloqueado', () => {
  it('AuthProvider renderiza igual: la aplicacion no queda en blanco', () => {
    bloquearAlmacenamiento()
    render(
      <AuthProvider>
        <p>contenido</p>
      </AuthProvider>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('hasSetPreferences responde false en vez de lanzar', () => {
    bloquearAlmacenamiento()
    expect(hasSetPreferences()).toBe(false)
  })
})
