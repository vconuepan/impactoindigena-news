import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CommandPalette from './CommandPalette'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPalette(open = true) {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <CommandPalette open={open} onClose={onClose} />
    </MemoryRouter>,
  )
  return { onClose }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it('lists destinations when open', () => {
    renderPalette()
    expect(screen.getByPlaceholderText('Ir a…')).toBeInTheDocument()
    expect(screen.getByText('Noticias')).toBeInTheDocument()
    expect(screen.getByText('Boletines')).toBeInTheDocument()
    expect(screen.getByText('Mantenimiento')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    renderPalette(false)
    expect(screen.queryByPlaceholderText('Ir a…')).not.toBeInTheDocument()
  })

  it('filters by label as the user types', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.type(screen.getByPlaceholderText('Ir a…'), 'bolet')
    expect(screen.getByText('Boletines')).toBeInTheDocument()
    expect(screen.queryByText('Noticias')).not.toBeInTheDocument()
  })

  it('filters by section name', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.type(screen.getByPlaceholderText('Ir a…'), 'distrib')
    // Distribución section: Boletines, Podcasts, Instagram, LinkedIn
    expect(screen.getByText('Boletines')).toBeInTheDocument()
    expect(screen.getByText('Podcasts')).toBeInTheDocument()
    expect(screen.queryByText('Noticias')).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.type(screen.getByPlaceholderText('Ir a…'), 'zzzzz')
    expect(screen.getByText(/Sin resultados/)).toBeInTheDocument()
  })

  it('navigates and closes when a result is chosen', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette()
    await user.click(screen.getByText('Boletines'))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/newsletters')
    expect(onClose).toHaveBeenCalled()
  })
})
