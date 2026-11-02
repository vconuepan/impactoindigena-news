import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import NotFoundPage from './NotFoundPage'

/**
 * Soft 404 (medido el 2-nov-2026): Azure Static Web Apps responde toda URL
 * inventada con la portada y estado 200. La página «no encontrada» es lo único
 * que le puede decir a Google que no la indexe.
 */
describe('NotFoundPage', () => {
  it('pide noindex', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/pagina-que-no-existe-xyz']}>
          <NotFoundPage />
        </MemoryRouter>
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull()
    })
  })
})
