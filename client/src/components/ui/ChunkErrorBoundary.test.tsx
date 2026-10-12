import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

const recarga = vi.hoisted(() => ({ recargarUnaVez: vi.fn(() => true) }))
vi.mock('../../lib/recarga-por-version', async (orig) => ({
  ...(await orig<typeof import('../../lib/recarga-por-version')>()),
  recargarUnaVez: recarga.recargarUnaVez,
}))

function ThrowingComponent({ error }: { error: Error }): never {
  throw error
}

describe('ChunkErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React error boundary console output
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ChunkErrorBoundary>
        <p>Content</p>
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('shows error UI when a child throws', () => {
    render(
      <ChunkErrorBoundary>
        <ThrowingComponent error={new Error('chunk failed')} />
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText('Failed to load page')).toBeInTheDocument()
    expect(screen.getByText(/newer version/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('calls window.location.reload when reload button is clicked', async () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    render(
      <ChunkErrorBoundary>
        <ThrowingComponent error={new Error('chunk failed')} />
      </ChunkErrorBoundary>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reloadMock).toHaveBeenCalled()
  })

  // Un despliegue borra los chunks anteriores (6-oct-2026): solo esa falla recarga sola.
  it('recarga sola, una vez, cuando falta un chunk', () => {
    recarga.recargarUnaVez.mockClear()
    render(
      <ChunkErrorBoundary>
        <ThrowingComponent error={new Error('Failed to fetch dynamically imported module: /assets/ReviewsPage-abc.js')} />
      </ChunkErrorBoundary>,
    )
    expect(recarga.recargarUnaVez).toHaveBeenCalledTimes(1)
  })

  it('ante cualquier otro error no recarga sola', () => {
    recarga.recargarUnaVez.mockClear()
    render(
      <ChunkErrorBoundary>
        <ThrowingComponent error={new Error("Cannot read properties of undefined (reading 'map')")} />
      </ChunkErrorBoundary>,
    )
    expect(recarga.recargarUnaVez).not.toHaveBeenCalled()
  })
})
