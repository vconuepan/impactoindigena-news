import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { vigilarInteraccion } from './engagement'

function visibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
}

beforeEach(() => {
  vi.useFakeTimers()
  visibilidad('visible')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('vigilarInteraccion', () => {
  it('avisa cuando hubo interaccion y 5 s visibles', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(4000)
    expect(aviso).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('un robot que solo carga la pagina nunca avisa, por mucho que espere', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    vi.advanceTimersByTime(60_000)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('interactuar enseguida no basta: espera los 5 s', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    window.dispatchEvent(new Event('pointerdown'))
    expect(aviso).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('si el tiempo ya paso, avisa en el momento de la interaccion', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    vi.advanceTimersByTime(10_000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('el tiempo con la pestaña oculta no cuenta', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    window.dispatchEvent(new Event('scroll'))
    visibilidad('hidden')
    vi.advanceTimersByTime(30_000)
    expect(aviso).not.toHaveBeenCalled()
    visibilidad('visible')
    vi.advanceTimersByTime(5000)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('el teclado y el foco cuentan: lector de pantalla sin mouse', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.advanceTimersByTime(5000)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('avisa una sola vez y deja de escuchar', () => {
    const aviso = vi.fn()
    vigilarInteraccion({ alInteractuar: aviso })
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(5000)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(60_000)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('detenerlo antes de tiempo cancela el aviso', () => {
    const aviso = vi.fn()
    const detener = vigilarInteraccion({ alInteractuar: aviso })
    window.dispatchEvent(new Event('scroll'))
    detener()
    vi.advanceTimersByTime(10_000)
    expect(aviso).not.toHaveBeenCalled()
  })
})
