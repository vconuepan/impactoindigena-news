import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders nothing when totalPages <= 1 and no page size selector', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    )
    expect(container.querySelector('nav')).not.toBeInTheDocument()
  })

  it('renders page buttons for multiple pages', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 3' })).toBeInTheDocument()
  })

  it('highlights the current page', () => {
    render(<Pagination page={2} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Página 1' })).not.toHaveAttribute('aria-current')
  })

  it('disables «Anterior» on first page', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).not.toBeDisabled()
  })

  it('disables «Siguiente» on last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página anterior' })).not.toBeDisabled()
  })

  it('calls onPageChange when a page button is clicked', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />)
    await user.click(screen.getByRole('button', { name: 'Página 2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with page - 1 when Previous is clicked', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    await user.click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('calls onPageChange with page + 1 when Next is clicked', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('shows ellipsis for many pages', () => {
    render(<Pagination page={5} totalPages={10} onPageChange={vi.fn()} />)
    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
    // First and last pages always shown
    expect(screen.getByRole('button', { name: 'Página 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 10' })).toBeInTheDocument()
  })

  describe('en español, como el resto del panel (11-nov-2026)', () => {
    it('los botones dicen «Anterior» y «Siguiente» y nombran la página para el lector de pantalla', () => {
      render(<Pagination page={2} totalPages={3} onPageChange={vi.fn()} />)
      const anterior = screen.getByRole('button', { name: 'Página anterior' })
      const siguiente = screen.getByRole('button', { name: 'Página siguiente' })
      expect(anterior).toHaveTextContent('Anterior')
      expect(siguiente).toHaveTextContent('Siguiente')
      expect(screen.getByRole('button', { name: 'Página 2' })).toHaveTextContent('2')
    })

    it('no queda texto en inglés', () => {
      const { container } = render(
        <Pagination page={2} totalPages={3} onPageChange={vi.fn()} pageSize={25} onPageSizeChange={vi.fn()} />,
      )
      expect(container.textContent).not.toMatch(/Previous|Next|Show/)
      expect(container.innerHTML).not.toMatch(/aria-label="Pagination"/)
    })
  })

  describe('page size selector', () => {
    it('renders page size selector when onPageSizeChange is provided', () => {
      render(
        <Pagination
          page={1}
          totalPages={3}
          onPageChange={vi.fn()}
          pageSize={25}
          onPageSizeChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText('Mostrar')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toHaveValue('25')
    })

    it('does not render page size selector when onPageSizeChange is not provided', () => {
      render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} />)
      expect(screen.queryByLabelText('Mostrar')).not.toBeInTheDocument()
    })

    it('renders all page size options', () => {
      render(
        <Pagination
          page={1}
          totalPages={3}
          onPageChange={vi.fn()}
          pageSize={25}
          onPageSizeChange={vi.fn()}
        />,
      )
      const select = screen.getByRole('combobox')
      const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
      expect(options).toEqual(['10', '25', '50', '100'])
    })

    it('calls onPageSizeChange when a new size is selected', async () => {
      const user = userEvent.setup()
      const onPageSizeChange = vi.fn()
      render(
        <Pagination
          page={1}
          totalPages={3}
          onPageChange={vi.fn()}
          pageSize={25}
          onPageSizeChange={onPageSizeChange}
        />,
      )
      await user.selectOptions(screen.getByRole('combobox'), '50')
      expect(onPageSizeChange).toHaveBeenCalledWith(50)
    })

    it('renders page size selector even when totalPages is 1', () => {
      render(
        <Pagination
          page={1}
          totalPages={1}
          onPageChange={vi.fn()}
          pageSize={100}
          onPageSizeChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText('Mostrar')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toHaveValue('100')
      // Page buttons should not be shown
      expect(screen.queryByRole('button', { name: 'Página anterior' })).not.toBeInTheDocument()
    })
  })
})
