import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { ToastProvider } from '../../components/ui/Toast'
import BrandPage from './BrandPage'

/** «Criterio por marca» (D5, entrega 2, ítem 11). */
const api = vi.hoisted(() => ({ panels: vi.fn(), elegidas: vi.fn(), setMode: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('../../lib/admin-api', () => ({
  adminApi: { brand: api },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))

const panel = (extra: Record<string, unknown> = {}) => ({
  slug: 'mapuche', name: 'Pueblo Mapuche', communityId: 'c-m', criterion: 'escala_mapuche', mode: 'shadow', rescueMode: 'shadow',
  guidelinesVersion: 1, tienePautas: true, dailyCallCap: 20, dailyTarget: 2, relevanceMin: 7, d4Mode: 'shadow',
  hoy: { llamadas: 12, juzgadas: 46, elegidas: 2, publicadas: 0 },
  siEncendieras: { elegidas: 2, visibles: 1, aLaCola: 1, dias: 7 },
  ...extra,
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <BrandPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'admin'
  api.panels.mockResolvedValue({ learningMode: true, enabled: true, data: [panel(), panel({ slug: 'wallmapu-araucania', name: 'Araucanía', criterion: 'territorial', rescueMode: 'off' })] })
  api.elegidas.mockResolvedValue({
    slug: 'mapuche',
    data: [{ storyId: 's1', titulo: 'Comunidades de Coñaripe exigen a Conadi la compra', eje: 'propuestas', nota: 7, lugar: 'williche', origen: 'rescate', estado: 'selected', motivo: null, banderas: ['victimas'], fecha: '2026-10-13T16:31:00Z', brandSlug: null }],
  })
  api.setMode.mockResolvedValue({ slug: 'mapuche', from: { mode: 'shadow', rescueMode: 'shadow' }, to: { mode: 'enforce', rescueMode: 'shadow' } })
})

describe('BrandPage', () => {
  it('muestra cada marca con lo de hoy, la vista previa y lo elegido', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Pueblo Mapuche' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Araucanía' })).toBeInTheDocument()
    expect(screen.getAllByText('12 de 20')).toHaveLength(2)
    expect((await screen.findAllByText('Comunidades de Coñaripe exigen a Conadi la compra')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Propuestas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sur williche').length).toBeGreaterThan(0)
    expect(screen.getAllByText('víctimas').length).toBeGreaterThan(0)
    // solo Mapuche tiene control de rescate
    expect(screen.getAllByLabelText('Cambiar el modo: rescate')).toHaveLength(1)
  })

  it('pasar a aplicar muestra la vista previa con el aprendizaje y manda el cambio', async () => {
    renderPage()
    const [selMapuche] = await screen.findAllByLabelText('Cambiar el modo: marca')
    fireEvent.change(selMapuche, { target: { value: 'enforce' } })
    expect(await screen.findByText(/1 se verían en la vertical y 1 irían a la revisión por marca/)).toBeInTheDocument()
    expect(screen.getByText(/todas quedarían pendientes hasta que las liberes/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(api.setMode).toHaveBeenCalledWith('mapuche', { mode: 'enforce' }))
  })

  it('un editor ve los modos pero no los cambia', async () => {
    auth.role = 'editor'
    renderPage()
    await screen.findByRole('heading', { name: 'Pueblo Mapuche' })
    expect(screen.queryByLabelText('Cambiar el modo: marca')).toBeNull()
  })

  it('avisa si el carril está apagado en el servidor', async () => {
    api.panels.mockResolvedValue({ learningMode: true, enabled: false, data: [panel()] })
    renderPage()
    expect(await screen.findByText(/El carril está apagado en el servidor/)).toBeInTheDocument()
  })
})
