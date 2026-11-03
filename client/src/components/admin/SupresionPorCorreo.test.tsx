import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../ui/Toast'
import { SupresionPorCorreo, resumenSupresion } from './SupresionPorCorreo'

const mockApi = vi.hoisted(() => ({ vistaPrevia: vi.fn(), suprimir: vi.fn() }))
vi.mock('../../lib/admin-api', () => ({ adminApi: { supresion: mockApi } }))

const VISTA = { cuentas: 1, suscripciones: 2, alertas: 1, enlaces: 0, comentarios: 0, brevo: 'esta' as const }

function abrir(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SupresionPorCorreo open onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return onClose
}

describe('SupresionPorCorreo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.vistaPrevia.mockResolvedValue(VISTA)
    mockApi.suprimir.mockResolvedValue({ ...VISTA, brevo: 'borrado' })
  })

  it('primero muestra lo que guarda el correo, sin borrar nada', async () => {
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    expect(await screen.findByText('Suscripciones al boletín')).toBeInTheDocument()
    expect(screen.getByText('Guarda el contacto: se borra')).toBeInTheDocument()
    expect(mockApi.vistaPrevia).toHaveBeenCalledWith('ana@x.cl')
    expect(mockApi.suprimir).not.toHaveBeenCalled()
  })

  it('suprime el correo revisado y se cierra', async () => {
    const onClose = abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Suprimir todo' }))

    expect(mockApi.suprimir).toHaveBeenCalledWith('ana@x.cl')
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('cambiar el correo después de revisar obliga a revisar de nuevo', async () => {
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    await screen.findByRole('button', { name: 'Suprimir todo' })

    await userEvent.type(screen.getByLabelText('Correo'), 'm')

    expect(screen.queryByRole('button', { name: 'Suprimir todo' }), 'se podía suprimir un correo que nadie revisó').toBeNull()
  })

  it('una revisión que llega tarde, de un correo ya editado, se descarta', async () => {
    let responder: (v: typeof VISTA) => void = () => {}
    mockApi.vistaPrevia.mockReturnValue(new Promise((r) => (responder = r)))
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'a@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    await userEvent.clear(screen.getByLabelText('Correo'))
    await userEvent.type(screen.getByLabelText('Correo'), 'b@x.cl')
    responder(VISTA)
    await new Promise((r) => setTimeout(r, 0))

    expect(
      screen.queryByRole('button', { name: 'Suprimir todo' }),
      'mostró lo de a@x.cl con b@x.cl en el campo: se suprimía un correo sin revisar',
    ).toBeNull()
  })

  it('dice el correo revisado y suprime ese', async () => {
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    expect(await screen.findByText('ana@x.cl')).toBeInTheDocument()
  })

  it('el aviso final no afirma que borró en Brevo lo que Brevo no tenía', () => {
    const base = { cuentas: 0, suscripciones: 0, alertas: 0, enlaces: 0, comentarios: 1 }
    expect(resumenSupresion({ ...base, brevo: 'no-estaba' })).toBe('Suprimido: 1 registro. Brevo no tenía el contacto')
    expect(resumenSupresion({ ...base, brevo: 'borrado' })).toBe('Suprimido: 1 registro y el contacto en Brevo')
  })

  it('sin nada guardado, no ofrece suprimir', async () => {
    mockApi.vistaPrevia.mockResolvedValue({ cuentas: 0, suscripciones: 0, alertas: 0, enlaces: 0, comentarios: 0, brevo: 'no-esta' })
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'nadie@x.cl')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    expect(await screen.findByText('No hay nada guardado con ese correo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suprimir todo' })).toBeDisabled()
  })
})
