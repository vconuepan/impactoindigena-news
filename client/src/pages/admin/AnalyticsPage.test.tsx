import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import AnalyticsPage from './AnalyticsPage'

const overview = vi.hoisted(() => vi.fn())
vi.mock('../../lib/admin-api', () => ({ adminApi: { analytics: { overview } } }))

const BASE = {
  period: 30, total: 100, today: 5, yesterday: 4, uniquePages: 10,
  uniqueVisitors: { today: 3, yesterday: 2, period: 80 },
  byCountry: [], byDevice: [], byDay: [], topPages: [], topStories: [], bySource: [],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <AnalyticsPage />
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

beforeEach(() => overview.mockReset())

describe('AnalyticsPage · bloques del 20-nov-2026', () => {
  it('con datos: cargas sin JavaScript, familias e interacción por país', async () => {
    overview.mockResolvedValue({
      ...BASE,
      automated: {
        desde: '2026-11-21',
        filas: [
          { surface: 'ficha_html', family: 'navegador', agent: '', count: 1000 },
          { surface: 'beacon', family: 'automatizacion', agent: 'HeadlessChrome', count: 500 },
          { surface: 'ficha_html', family: 'otro_robot', agent: 'Googlebot (falso)', count: 80 },
        ],
        fichasConJs: 360,
      },
      interaction: {
        desde: '2026-11-21', visitantes: 220, interactuaron: 13,
        porPais: [{ country: 'CL', visitantes: 20, interactuaron: 12 }],
      },
    })
    renderPage()
    expect(await screen.findByText('640 (64 %)')).toBeInTheDocument()
    // Los dos bloques dicen desde cuándo miden.
    expect(screen.getAllByText(/desde el 21-11-2026/)).toHaveLength(2)
    expect(screen.getByText('Navegadores sin pantalla y librerías')).toBeInTheDocument()
    // En la lista de agentes y en la nota que lo explica.
    expect(screen.getAllByText(/Googlebot \(falso\)/)).toHaveLength(2)
    expect(screen.getByText('13 (6 %)')).toBeInTheDocument()
    expect(screen.getByText('60 %')).toBeInTheDocument()
  })

  it('antes del SQL: avisa que no hay datos y no rompe la página', async () => {
    overview.mockResolvedValue({ ...BASE, automated: { desde: null, filas: [], fichasConJs: 0 }, interaction: { desde: null, visitantes: 0, interactuaron: 0, porPais: [] } })
    renderPage()
    expect(await screen.findAllByText(/Sin datos aún\. Empieza a medir/)).toHaveLength(2)
  })

  it('con un servidor anterior que no manda los campos nuevos, tampoco rompe', async () => {
    overview.mockResolvedValue(BASE)
    renderPage()
    expect(await screen.findAllByText(/Sin datos aún\. Empieza a medir/)).toHaveLength(2)
  })
})
