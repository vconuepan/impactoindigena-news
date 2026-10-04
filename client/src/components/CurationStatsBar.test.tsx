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
})
