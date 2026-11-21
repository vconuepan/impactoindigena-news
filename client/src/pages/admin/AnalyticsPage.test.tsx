import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('lectores probables: número, rango, bruto y selector por categoría', async () => {
    const c = (clave: string, bruto: number, lector: number, dudoso: number, bot: number) => ({ clave, bruto, lector, dudoso, bot })
    overview.mockResolvedValue({
      ...BASE,
      readers: {
        activo: true, desde: '2026-11-22', visitantes: 500, conSenales: 480,
        total: { bruto: 480, lector: 30, dudoso: 50, bot: 400 },
        porPais: [c('CN', 300, 0, 10, 290), c('CL', 40, 25, 10, 5)],
        porDispositivo: [c('desktop', 450, 15, 40, 395)],
        porOrigen: [c('direct', 460, 20, 45, 395)],
        porRed: [c('Alibaba Cloud', 250, 0, 5, 245), c('Red que no es de nube', 200, 30, 40, 130)],
        motivosEnContra: [{ motivo: '−15 red de nube', veces: 380 }],
        edicionRedes: '2026-11',
      },
    })
    renderPage()
    expect(await screen.findByText(/Lectores probables · desde el 22-11-2026/)).toBeInTheDocument()
    expect(screen.getByText('(rango 30–80)')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText(/Es una estimación, no un conteo de personas/)).toBeInTheDocument()
    expect(screen.getByText(/20 visitantes-día de la ventana no tienen señales/)).toBeInTheDocument()
    expect(screen.getByText('Alibaba Cloud')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'IP Geolocation by DB-IP' })).toHaveAttribute('href', 'https://db-ip.com')

    // «Todos» muestra las tres categorías; «Probables bots» deja solo esa columna.
    expect(screen.getAllByRole('columnheader', { name: 'Dudosos' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Probables bots' }))
    expect(screen.queryAllByRole('columnheader', { name: 'Dudosos' })).toHaveLength(0)
    expect(screen.getAllByRole('columnheader', { name: 'Probables bots' }).length).toBeGreaterThan(0)
  })

  it('con el puntaje apagado lo dice y no muestra el desglose', async () => {
    overview.mockResolvedValue({ ...BASE, readers: { activo: false, desde: null, visitantes: 0, conSenales: 0, total: { bruto: 0, lector: 0, dudoso: 0, bot: 0 }, porPais: [], porDispositivo: [], porOrigen: [], porRed: [], motivosEnContra: [], edicionRedes: '2026-11' } })
    renderPage()
    expect(await screen.findByText(/está apagado/)).toBeInTheDocument()
    expect(screen.queryByText('Exportar CSV')).toBeNull()
  })

  it('con un servidor anterior que no manda los campos nuevos, tampoco rompe', async () => {
    overview.mockResolvedValue(BASE)
    renderPage()
    expect(await screen.findAllByText(/Sin datos aún\. Empieza a medir/)).toHaveLength(2)
  })
})
