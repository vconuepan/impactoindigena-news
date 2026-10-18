import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { JoinBlock } from './CommunityPage'

/**
 * Salir de una comunidad que no es PUEBLO no puede deshacerse solo.
 *
 * EL DEFECTO QUE ESTO CIERRA (18-oct-2026). Una persona con sesion que visita una
 * comunidad TERRITORIO o CAUSA se une sola (es a proposito: esas comunidades no
 * piden consentimiento). Pero «Abandonar comunidad» dejaba la membresia en
 * `isMember: false`, el efecto de auto-union lo veia y volvia a unirla al
 * instante; y como la fila ya no existia, el servidor mandaba OTRA bienvenida en
 * cada vuelta. No se podia salir de las nueve comunidades que no son PUEBLO.
 *
 * Se simula `fetch` con un servidor que RECUERDA si la persona es miembro, para
 * que el bucle se reproduzca de verdad si el cerrojo falla.
 */
const fetchMock = vi.fn()
let miembro = false

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

const llamadas = (sufijo: string, metodo: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(sufijo) && (init?.method ?? 'GET') === metodo)

function abrir(tipo: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JoinBlock slug="amazonia" communityName="Amazonia" communityType={tipo} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  miembro = false
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    if (String(url).endsWith('/membership')) return json({ isMember: miembro, consented: false })
    if (String(url).endsWith('/join') && metodo === 'POST') { miembro = true; return json({ isMember: true }) }
    if (String(url).endsWith('/leave') && metodo === 'DELETE') { miembro = false; return json({ isMember: false }) }
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'member_session=1; path=/'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'member_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('auto-union y salida en comunidades que no son PUEBLO', () => {
  it('quien visita una comunidad TERRITORIO se une una sola vez', async () => {
    abrir('TERRITORIO')

    expect(await screen.findByText('Eres miembro de esta comunidad')).toBeInTheDocument()
    expect(llamadas('/join', 'POST')).toHaveLength(1)
  })

  it('al abandonar NO vuelve a unirse: lo dice y no deja la pagina en «Cargando…»', async () => {
    miembro = true
    abrir('TERRITORIO')
    await userEvent.click(await screen.findByRole('button', { name: 'Abandonar comunidad' }))

    expect(await screen.findByText('Saliste de esta comunidad')).toBeInTheDocument()
    await esperar(60) // si hubiera bucle, el efecto ya habria vuelto a unirla
    expect(llamadas('/leave', 'DELETE')).toHaveLength(1)
    expect(llamadas('/join', 'POST'), 'al abandonar, la pagina la volvio a unir: no se puede salir').toHaveLength(0)
    expect(screen.queryByText(/Uniéndote|Cargando/)).not.toBeInTheDocument()
    expect(screen.queryByText('Eres miembro de esta comunidad')).not.toBeInTheDocument()
  })

  it('volver es un acto explicito: «Volver a unirme» hace UN POST', async () => {
    miembro = true
    abrir('CAUSA')
    await userEvent.click(await screen.findByRole('button', { name: 'Abandonar comunidad' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Volver a unirme' }))

    expect(await screen.findByText('Eres miembro de esta comunidad')).toBeInTheDocument()
    expect(llamadas('/join', 'POST')).toHaveLength(1)
  })

  it('una comunidad PUEBLO no cambia: no se une sola y pide el consentimiento', async () => {
    abrir('PUEBLO')

    expect(await screen.findByRole('button', { name: 'Confirmar unión' })).toBeInTheDocument()
    await esperar(60)
    expect(llamadas('/join', 'POST')).toHaveLength(0)
  })
})
