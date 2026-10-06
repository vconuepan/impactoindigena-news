import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'es' } }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('CurationStatsBar', () => {
  it('pide las estadisticas al backend configurado en VITE_API_URL', async () => {
    // Hasta el 4-oct-2026 usaba fetch('/api/stats/daily') con ruta relativa:
    // en local contra otro backend la barra quedaba vacia sin ningun error.
    vi.stubEnv('VITE_API_URL', 'https://backend.test')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crawled24h: 1200, published24h: 34, activeFeeds: 96 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: CurationStatsBar } = await import('./CurationStatsBar')
    render(<CurationStatsBar />)

    expect(fetchMock).toHaveBeenCalledWith('https://backend.test/api/stats/daily')
    expect(await screen.findByText('96')).toBeInTheDocument()
  })

  it('antes de los datos reserva la MISMA frase, invisible, no un hueco de una linea', async () => {
    // En movil la frase ocupa dos lineas. Un hueco de una linea hacia saltar
    // 18 px toda la pagina al llegar los datos (CLS 0,021) y, al reemplazar la
    // portada prerenderizada, movia el hero lo justo para que Chrome contara un
    // candidato a LCP nuevo, el de React (traza del 6-oct-2026).
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // nunca responde
    const { default: CurationStatsBar, CIFRAS_DE_RESERVA } = await import('./CurationStatsBar')
    const { container } = render(<CurationStatsBar />)

    const barra = container.firstElementChild as HTMLElement
    const frase = barra.querySelector('p') as HTMLElement
    // Invisible y fuera del arbol accesible: ocupa espacio, no informa nada.
    expect(barra.getAttribute('aria-hidden')).toBe('true')
    expect(frase.className).toContain('invisible')
    // Las mismas piezas que la frase real: los tres rotulos y tres cifras.
    for (const k of ['curationStats.window', 'curationStats.analyzed', 'curationStats.selected', 'curationStats.sources']) {
      expect(frase.textContent).toContain(k)
    }
    expect(frase.querySelectorAll('strong')).toHaveLength(3)
    expect(frase.textContent).toContain(String(CIFRAS_DE_RESERVA.crawled24h))
  })

  it('con datos, la frase visible tiene la misma forma que la de reserva', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crawled24h: 567, published24h: 29, activeFeeds: 129 }),
    }))
    const { default: CurationStatsBar } = await import('./CurationStatsBar')
    const { container } = render(<CurationStatsBar />)
    await screen.findByText('129')

    const frase = container.querySelector('p') as HTMLElement
    expect(frase.className).not.toContain('invisible')
    expect(frase.querySelectorAll('strong')).toHaveLength(3)
    expect(container.firstElementChild?.getAttribute('role')).toBe('complementary')
  })
})
