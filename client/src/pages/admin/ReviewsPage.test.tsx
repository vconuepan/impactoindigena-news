import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { ToastProvider } from '../../components/ui/Toast'
import ReviewsPage from './ReviewsPage'

/**
 * La pantalla de revisión por marca (D4, Tanda B): la franja del modo, la
 * cola, y la guardia de liberar en masa con señal fuerte, que la pantalla
 * repite para no mandar un 409 evitable (el servidor la tiene igual).
 */
const api = vi.hoisted(() => ({
  verticals: vi.fn(),
  queue: vi.fn(),
  decide: vi.fn(),
  bulkDecide: vi.fn(),
  modePreview: vi.fn(),
  setMode: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { reviews: api },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u', email: 'a@b', name: 'A', role: 'editor' } }) }))

const stats = {
  mode: 'shadow',
  effectiveMode: 'shadow',
  learningMode: true,
  visibleToday: 389,
  visibleIfEnforced: 185,
  byState: { auto: 0, pending: 3, released: 0, held: 0 },
  missingRows: 0,
  oldestPendingAt: null,
  oldestPendingHours: 12,
  queueAlert: false,
}

function fila(n: number, gateScore: number, reasons: string[]) {
  return {
    id: `r${n}`,
    storyId: `s${n}`,
    reviewState: 'pending',
    reviewCode: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    gateDecision: 'held_for_review',
    gateReasons: ['learning_mode', ...reasons],
    gateSignals: [],
    gateScore,
    gateLearningMode: true,
    gateVersion: 'abc',
    gateEvaluatedAt: '2026-10-04T00:00:00Z',
    publishedAt: '2026-10-04T00:00:00Z',
    story: { id: `s${n}`, slug: `nota-${n}`, title: `Nota ${n}`, titleLabel: null, sourceTitle: `Fuente ${n}`, summary: 'Resumen con condena.', narrativeFrame: null, datePublished: '2026-10-03T00:00:00Z', relevance: 4 },
    alsoIn: n === 1 ? [{ slug: 'wallmapu-araucania', name: 'Araucanía', reviewState: 'pending' }] : [],
  }
}

function renderPage(url = '/admin/revision') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={[url]}>
            <ReviewsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.verticals.mockResolvedValue({
    learningMode: true,
    bulkReleaseMaxScore: 1,
    data: [
      { slug: 'mapuche', mode: 'shadow', stats },
      { slug: 'wallmapu-araucania', mode: 'shadow', stats: { ...stats, byState: { ...stats.byState, pending: 1 }, queueAlert: true } },
    ],
  })
  api.queue.mockResolvedValue({
    slug: 'mapuche',
    mode: 'shadow',
    data: [fila(1, 3, ['frame:confrontacion', 'listA:condena']), fila(2, 0, []), fila(3, 1, ['listB+corroborated:policia'])],
    total: 3,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  })
  api.decide.mockResolvedValue({})
  api.bulkDecide.mockResolvedValue({ updated: 1, missing: [] })
})

describe('ReviewsPage', () => {
  it('muestra las marcas, la franja de sombra con los contadores y la cola por puntaje', async () => {
    renderPage()
    expect(await screen.findByRole('tab', { name: /Voces Mapuche/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Voces Araucanía/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Modo sombra/)
    expect(screen.getByRole('status')).toHaveTextContent('389')
    expect(screen.getByRole('status')).toHaveTextContent('185')
    expect(await screen.findByText('Nota 1')).toBeInTheDocument()
    expect(screen.getByText('Encuadre: confrontacion')).toBeInTheDocument()
    expect(screen.getByText(/también en: Voces Araucanía/)).toBeInTheDocument()
    // Un editor no ve el selector de modo.
    expect(screen.queryByLabelText('Cambiar el modo')).not.toBeInTheDocument()
    expect(api.queue).toHaveBeenCalledWith('mapuche', { state: 'pending', page: 1, pageSize: 25 })
  })

  it('liberar en masa se desactiva si alguna seleccionada tiene señal fuerte', async () => {
    renderPage()
    await screen.findByText('Nota 1')
    fireEvent.click(screen.getByLabelText('Seleccionar Nota 2'))
    expect(screen.getByRole('button', { name: 'Liberar seleccionadas' })).toBeEnabled()
    fireEvent.click(screen.getByLabelText('Seleccionar Nota 1'))
    expect(screen.getByRole('button', { name: 'Liberar seleccionadas' })).toBeDisabled()
    expect(screen.getByText(/1 con señal fuerte/)).toBeInTheDocument()
    // Retener en masa siempre se puede.
    expect(screen.getByRole('button', { name: 'Retener seleccionadas' })).toBeEnabled()
  })

  it('retener pide un código antes de habilitar el botón, y manda código y nota', async () => {
    renderPage()
    await screen.findByText('Nota 2')
    fireEvent.click(screen.getAllByRole('button', { name: 'Retener' })[1])
    const dialogo = await screen.findByRole('dialog')
    const confirmar = screen.getByRole('button', { name: 'Retener', hidden: false })
    expect(dialogo).toHaveTextContent('Retener esta nota')
    expect(confirmar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'out_of_scope' } })
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'Es de Neuquén' } })
    expect(confirmar).toBeEnabled()
    fireEvent.click(confirmar)
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('mapuche', { storyId: 's2', decision: 'hold', code: 'out_of_scope', note: 'Es de Neuquén' }),
    )
  })

  it('la pestaña con cola vencida lleva la marca de alerta, y la URL elige la marca', async () => {
    renderPage('/admin/revision?marca=wallmapu-araucania&estado=held')
    const tab = await screen.findByRole('tab', { name: /Voces Araucanía/ })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveTextContent('!')
    expect(api.queue).toHaveBeenCalledWith('wallmapu-araucania', { state: 'held', page: 1, pageSize: 25 })
  })
})
